import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

const DEFAULT_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 12;
const MAX_BATCH_SIZE = 300;
const LLM_TIMEOUT_MS = 60000;
const MIN_SUMMARY_LENGTH = 800;
const FAST_CACHE_TTL_MS = 120_000;
const FULL_MODE_BATCH_SIZE = 250;
const FULL_MODE_MAX_TOKENS = 14000;
const MAX_LLM_TOKENS = 16384;
const MIN_LLM_TOKENS = 1024;

const WINDOW_HOURS = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "48h": 48,
  "7d": 168,
} as const;

type DigestCacheEntry = {
  summary: string;
  eventCount: number;
  analyzedCount: number;
  generatedAt: string;
};

let fallbackCache:
  | {
      expiresAt: number;
      key: string;
      value: DigestCacheEntry;
    }
  | null = null;

const SYSTEM_PROMPT = `You are producing a clear, professional strategic summary of global events for decision-makers and informed readers who may not be intelligence specialists.

CRITICAL OUTPUT RULES:
- Do NOT use Markdown.
- Use plain text only.
- Use uppercase section headers on their own lines.
- Prefer clear, direct sentences that a layperson can understand on first read.
- Explain technical terms (such as the Goldstein scale) the first time they appear.
- Target 1200-2200 words unless the data is extremely thin. Be concise.

Required structure:

REPORT DATE/TIME (UTC)
One line with the current UTC timestamp.

BOTTOM LINE
A clear 4-6 sentence paragraph giving the single most important takeaway, what it means in practical terms, and what decision-makers should pay attention to.

OPERATING PICTURE
Two straightforward paragraphs describing the overall picture: how much conflict vs cooperation is happening, where the main activity is, and whether things are escalating or stabilizing.

KEY DEVELOPMENTS
8-12 numbered items. For each item use this exact format:

WHAT HAPPENED
A short, plain-language paragraph describing exactly what occurred: who did what to whom, where, and the basic character of the event (cooperative, verbal conflict, or material conflict).

WHY IT MATTERS
A short paragraph explaining the real-world significance in accessible terms.

METRICS
Goldstein | value + plain-English explanation
Mentions | value
Sources | value
Tone | value + plain-English interpretation
Event Code | value

ACTOR INTENT AND MOTIVATION
4-6 clear paragraphs describing what the main players appear to be trying to achieve and what they might do next.

REGIONAL HOTSPOTS
4-6 paragraphs on the key locations, what is driving events there, and any spillover risks.

COOPERATION AND DIPLOMATIC TRACK
One or more paragraphs highlighting any meaningful cooperative or stabilizing developments.

ANOMALIES AND WEAK SIGNALS
One paragraph on unusual or thinly reported events that could become important.

INFORMATION ENVIRONMENT
One paragraph on how the media and public conversation are treating these events and whether attention matches the actual significance.

INDICATORS TO WATCH
Two short subsections:
NEAR-TERM (6-48 HOURS)
1-6 specific things to monitor in the coming days.
FOLLOW-ON (1-2 WEEKS)
1-5 things to track over the next couple of weeks.

OUTLOOK
A concise synthesis paragraph on the most likely path forward, the main factors that could change it, and what would invalidate the current picture.

METHODOLOGY
A short, clear paragraph explaining (1) how events were chosen and ranked for this report (the scoring approach), and (2) what the Goldstein scale measures and how to interpret positive vs negative numbers. Write in plain language.

Tone guidance: professional and authoritative but accessible. Avoid heavy tradecraft language. Use plain statements and explain things directly. Explain the Goldstein scale on first use. Cite specific numbers and actors, but keep the writing readable for a layperson.`;

// JSON-oriented prompt for structured report requests
const JSON_REPORT_PROMPT = `You are a senior all-source intelligence analyst. Produce a structured JSON intelligence report ONLY (valid JSON, no other text before or after).

Output exactly this shape:
{
  "reportDateTime": "string",
  "bottomLine": "dense paragraph",
  "operatingPicture": "two paragraphs as single string",
  "keyDevelopments": [ { "whatHappened": "...", "whyItMatters": "...", "metrics": { "goldstein": "...", ... } } , ... ],
  "actorIntent": "paragraphs as string",
  "regionalHotspots": "string",
  "cooperationTrack": "string",
  "anomalies": "string",
  "informationEnvironment": "string",
  "indicatorsNearTerm": ["..."],
  "indicatorsFollowOn": ["..."],
  "outlook": "string",
  "methodology": "string  (explanation of the event prioritization rubric and the Goldstein scale)"
}

Use the provided GDELT data. Be authoritative and cite specifics.`;

function formatActor(name?: string, country?: string) {
  const safeName = name?.trim() || "UNKNOWN";
  const safeCountry = country?.trim() || "?";
  return `${safeName} (${safeCountry})`;
}

function eventScore(event: {
  goldsteinScale: number;
  numMentions: number;
  numSources: number;
  avgTone: number;
}) {
  return Math.abs(event.goldsteinScale) * 2 + event.numMentions * 0.6 + event.numSources * 0.4 + Math.abs(event.avgTone) * 0.2;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function goldsteinMeaning(score: number) {
  // Professional explanation of the GDELT Goldstein scale (-10 to +10)
  if (score <= -7) return "very severe conflict or coercion (extreme negative signal on the -10 to +10 Goldstein scale)";
  if (score <= -5) return "clear conflict pressure (strong negative signal on the -10 to +10 Goldstein scale)";
  if (score < 0) return "mild conflict or tension (negative territory on the -10 to +10 Goldstein scale)";
  if (score < 5) return "limited cooperation or low-intensity alignment (positive but modest on the -10 to +10 Goldstein scale)";
  if (score < 7) return "meaningful cooperation or stabilizing behavior (solid positive signal on the -10 to +10 Goldstein scale)";
  return "strong cooperation, de-escalation, or alignment (high positive signal on the -10 to +10 Goldstein scale)";
}

function toneMeaning(tone: number) {
  if (tone <= -5) return "very negative coverage";
  if (tone <= -2) return "negative coverage";
  if (tone < 2) return "mixed or neutral coverage";
  if (tone < 5) return "positive coverage";
  return "very positive coverage";
}

function eventCharacterLabel(quadClass: number) {
  if (quadClass === 4) return "material conflict";
  if (quadClass === 3) return "verbal conflict";
  if (quadClass === 1 || quadClass === 2) return "cooperation";
  return "unclear event character";
}

function describeObservedEvent(event: Awaited<ReturnType<typeof fetchGdeltEvents>>[number]) {
  const actor1 = formatActor(event.actor1Name, event.actor1Country);
  const actor2 = formatActor(event.actor2Name, event.actor2Country);
  const location = event.actionGeoName || event.actionGeoCountry || "unknown location";
  const character = eventCharacterLabel(event.quadClass);

  return `GDELT recorded ${character} involving ${actor1} and ${actor2} in ${location}.`;
}

function getCacheKey(events: Awaited<ReturnType<typeof fetchGdeltEvents>>, analyzedCount: number) {
  const lead = events.slice(0, 8).map((event) => [
    event.eventCode,
    event.goldsteinScale,
    event.numMentions,
    event.avgTone,
    event.actionGeoName,
    event.actor1Name,
    event.actor2Name,
  ].join("|"));

  return `${events.length}:${analyzedCount}:${lead.join("||")}`;
}

function applyWindow(
  events: Awaited<ReturnType<typeof fetchGdeltEvents>>,
  windowParam: string | null,
) {
  if (!windowParam || windowParam === "ALL") return events;
  if (!(windowParam in WINDOW_HOURS)) return events;

  const horizon = Date.now() - WINDOW_HOURS[windowParam as keyof typeof WINDOW_HOURS] * 3_600_000;
  return events.filter((event) => {
    if (!/^\d{14}$/.test(event.dateAdded)) return false;
    const ts = Date.UTC(
      Number(event.dateAdded.slice(0, 4)),
      Number(event.dateAdded.slice(4, 6)) - 1,
      Number(event.dateAdded.slice(6, 8)),
      Number(event.dateAdded.slice(8, 10)),
      Number(event.dateAdded.slice(10, 12)),
      Number(event.dateAdded.slice(12, 14)),
    );
    return Number.isFinite(ts) && ts >= horizon;
  });
}

function buildFallbackDigest(nowUtc: string, events: Awaited<ReturnType<typeof fetchGdeltEvents>>, analyzedCount: number) {
  const sortedByScore = [...events].sort((a, b) => eventScore(b) - eventScore(a));
  const topEvents = sortedByScore.slice(0, Math.min(10, analyzedCount));
  const positiveEvents = [...events].filter((e) => e.goldsteinScale >= 5).sort((a, b) => eventScore(b) - eventScore(a)).slice(0, 4);
  const negativeEvents = [...events].filter((e) => e.goldsteinScale <= -5).sort((a, b) => eventScore(b) - eventScore(a)).slice(0, 4);
  const weakSignals = [...events]
    .filter((e) => Math.abs(e.goldsteinScale) >= 7 && e.numMentions <= 3)
    .sort((a, b) => eventScore(b) - eventScore(a))
    .slice(0, 3);

  const quadCounts = { cooperation: 0, verbalConflict: 0, materialConflict: 0, other: 0 };
  const regionCounts = new Map<string, number>();
  const actorStats = new Map<string, { count: number; mentions: number; avgTone: number; avgGoldstein: number }>();

  for (const event of events) {
    const region = event.actionGeoCountry || "Unknown";
    regionCounts.set(region, (regionCounts.get(region) || 0) + 1);

    if (event.quadClass === 1 || event.quadClass === 2) quadCounts.cooperation++;
    else if (event.quadClass === 3) quadCounts.verbalConflict++;
    else if (event.quadClass === 4) quadCounts.materialConflict++;
    else quadCounts.other++;

    for (const [name, country] of [
      [event.actor1Name, event.actor1Country],
      [event.actor2Name, event.actor2Country],
    ] as const) {
      const key = formatActor(name, country);
      const prev = actorStats.get(key) ?? { count: 0, mentions: 0, avgTone: 0, avgGoldstein: 0 };
      prev.count += 1;
      prev.mentions += event.numMentions;
      prev.avgTone += event.avgTone;
      prev.avgGoldstein += event.goldsteinScale;
      actorStats.set(key, prev);
    }
  }

  const topRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topActors = [...actorStats.entries()]
    .map(([actor, stat]) => ({
      actor,
      count: stat.count,
      mentions: stat.mentions,
      avgTone: stat.avgTone / stat.count,
      avgGoldstein: stat.avgGoldstein / stat.count,
    }))
    .sort((a, b) => b.count - a.count || b.mentions - a.mentions)
    .slice(0, 5);

  const total = events.length;
  const avgTone = average(events.map((e) => e.avgTone));
  const avgMentions = average(events.map((e) => e.numMentions));
  const avgGoldstein = average(events.map((e) => e.goldsteinScale));
  const conflictShare = total ? ((quadCounts.verbalConflict + quadCounts.materialConflict) / total) * 100 : 0;
  const cooperationShare = total ? (quadCounts.cooperation / total) * 100 : 0;

  const lines: string[] = [];
  lines.push("REPORT DATE/TIME (UTC)");
  lines.push(nowUtc);
  lines.push("");

  lines.push("BOTTOM LINE");
  lines.push(
    `The data shows ${total} filtered events, with ${quadCounts.materialConflict} material-conflict events and ${quadCounts.verbalConflict} verbal-conflict events against ${quadCounts.cooperation} cooperative events. The places with the most events are ${topRegions.map(([region, count]) => `${region} (${count})`).join(", ")}. The overall picture leans toward tension because the highest-impact items have strongly negative scores on the -10 to +10 scale, especially in ${negativeEvents[0]?.actionGeoName || "the leading negative-signal locations"}. The key near-term question is whether those negative events gain more mentions and sources over the next one or two update cycles. The most useful next step is confirming the top negative items with independent reporting so a thinly sourced outlier does not create false urgency.`
  );
  lines.push("");

  lines.push("OPERATING PICTURE");
  lines.push(
    `Conflict-type events make up ${conflictShare.toFixed(1)} percent of filtered events, while cooperation-coded activity accounts for ${cooperationShare.toFixed(1)} percent. Average tone is ${avgTone.toFixed(1)}, which indicates ${toneMeaning(avgTone)}, and average score is ${avgGoldstein.toFixed(1)} (${goldsteinMeaning(avgGoldstein)}). The most active actors are ${topActors.map((actor) => `${actor.actor} (${actor.count} events, average Goldstein ${actor.avgGoldstein.toFixed(1)})`).join("; ")}. The picture shows routine state and institutional activity running in parallel with a smaller set of high-severity conflict items that matter more than their raw event count suggests.`
  );
  lines.push(
    `The most significant events involve ${topEvents.slice(0, 3).map((event) => `${formatActor(event.actor1Name, event.actor1Country)} involving ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, meaning ${goldsteinMeaning(event.goldsteinScale)}; mentions ${event.numMentions}; tone ${event.avgTone.toFixed(1)})`).join("; ")}. There is also notable cooperative activity in ${positiveEvents.map((event) => event.actionGeoName || "unknown locations").slice(0, 3).join(", ") || "the current sample"}. The central question is whether the negative items become broader military, diplomatic, or domestic-security storylines. Unless reporting volume increases significantly above the current average of ${avgMentions.toFixed(1)}, the base case remains localized friction with selective amplification rather than immediate system-wide escalation.`
  );
  lines.push("");

  lines.push("KEY DEVELOPMENTS");
  topEvents.forEach((event, index) => {
    lines.push(`${index + 1}.`);
    lines.push("WHAT HAPPENED");
    lines.push(describeObservedEvent(event));
    lines.push("WHY IT MATTERS");
    lines.push(
      `Significance: ${event.goldsteinScale <= -5 ? "this is a strong negative signal. On GDELT's scale, a score this low points to coercion, violence, or another clearly destabilizing move that can matter quickly if more reporting follows." : event.goldsteinScale >= 5 ? "this is a meaningful stabilizing or alignment signal. On GDELT's scale, a score this high points to cooperation, de-escalation, or a durable diplomatic signal worth watching for follow-through." : "this is a medium-salience directional signal. It matters less as a standalone event and more as part of the broader pattern around the same actors or region."}`
    );
    lines.push("METRICS");
    lines.push(`Goldstein | ${event.goldsteinScale.toFixed(1)} | ${goldsteinMeaning(event.goldsteinScale)}`);
    lines.push(`Mentions | ${event.numMentions}`);
    lines.push(`Sources | ${event.numSources}`);
    lines.push(`Tone | ${event.avgTone.toFixed(1)} | ${toneMeaning(event.avgTone)}`);
    lines.push(`Event Code | ${event.eventCode}`);
    lines.push(`Event Character | ${eventCharacterLabel(event.quadClass)}`);
    lines.push("");
  });

  lines.push("ACTOR INTENT AND MOTIVATION");
  topActors.slice(0, 4).forEach((actor) => {
    lines.push(
      `${actor.actor} appears ${actor.count} times in the filtered event set with ${actor.mentions} cumulative mentions, average Goldstein ${actor.avgGoldstein.toFixed(1)}, and average tone ${actor.avgTone.toFixed(1)}. This actor appears to be operating inside a high-visibility information environment where repeated appearance may reflect both real activity and media concentration. If the actor’s average score remains ${actor.avgGoldstein < 0 ? "negative" : "positive"} across the next cycle, it will likely remain a useful anchor for trend direction rather than a one-off anomaly.`
    );
  });
  lines.push("");

  lines.push("REGIONAL HOTSPOTS");
  topRegions.slice(0, 4).forEach(([region, count]) => {
    const regionalEvents = events.filter((event) => (event.actionGeoCountry || "Unknown") === region).sort((a, b) => eventScore(b) - eventScore(a)).slice(0, 2);
    lines.push(
      `${region} accounts for ${count} filtered events. Lead signals include ${regionalEvents.map((event) => `${event.actionGeoName || region} with Goldstein ${event.goldsteinScale} and ${event.numMentions} mentions`).join("; ")}. This region’s near-term trajectory depends on whether current top events remain isolated or begin to generate adjacent reporting from additional actors, sources, or locations. Confidence is moderate because event density is measurable, but causality remains partly inferential at this stage.`
    );
  });
  lines.push("");

  lines.push("COOPERATION AND DIPLOMATIC TRACK");
  lines.push(
    positiveEvents.length
      ? `cooperative or stabilizing signals remain present despite the conflict-heavy top line. The strongest positive items include ${positiveEvents.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} and ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. These items matter less as proof of immediate resolution than as evidence that institutional coordination, diplomatic signaling, or non-kinetic engagement channels remain active in parallel with coercive behavior.`
      : `the current filtered sample offers limited high-salience cooperative reporting. that absence does not prove diplomacy is absent, but it does mean the information environment is weighting conflict and coercion more heavily than overt stabilization messaging in this cycle.`
  );
  lines.push("");

  lines.push("ANOMALIES AND WEAK SIGNALS");
  lines.push(
    weakSignals.length
      ? `several thinly sourced but high-intensity outliers merit caution: ${weakSignals.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} to ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. these are classic weak signals: potentially important if corroborated, but equally capable of exaggerating risk if they remain isolated in low-volume reporting.`
      : `the present event set is dominated more by repeated mainstream signals than by isolated edge cases. the anomaly burden is therefore lower this cycle, though that also means genuine early indicators may be harder to distinguish from routine churn without watching mention acceleration.`
  );
  lines.push("");

  lines.push("INFORMATION ENVIRONMENT");
  lines.push(
    `average tone is ${avgTone.toFixed(1)}, meaning ${toneMeaning(avgTone)}, and the mean mention count is ${avgMentions.toFixed(1)}, while the top-scoring events materially exceed that attention baseline. The information environment is amplifying a small number of sharper events rather than distributing attention evenly. Divergence between narrative heat and material significance is most likely when negative Goldstein outliers carry low mention counts, meaning analysts should separate emotional coverage from evidence of broader mobilization.`
  );
  lines.push("");

  lines.push("INDICATORS TO WATCH");
  lines.push("NEAR-TERM (6-48 HOURS)");
  [
    `Watch whether the top negative event cluster in ${negativeEvents[0]?.actionGeoName || "the leading hotspot"} gains additional mentions or sources above the current average of ${avgMentions.toFixed(1)}.`,
    `Watch for repeat appearance of the current top actors, especially ${topActors[0]?.actor || "the lead actor"}, with more negative average Goldstein values.`,
    `Watch for spillover reporting into adjacent geographies beyond ${topRegions[0]?.[0] || "the leading region"}.`,
    `Watch whether cooperative items remain visible or disappear from the next cycle altogether.`,
  ].forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("FOLLOW-ON (1-2 WEEKS)");
  [
    `Track whether today’s top hotspots persist as recurrent reporting nodes or decay back into background churn.`,
    `Track whether actor frequency consolidates around a narrower crisis set or broadens into multi-actor diplomatic management.`,
    `Track whether tone stays negative while Goldstein moderates, which would suggest narrative heat exceeding material escalation.`,
    `Track whether positive high-Goldstein events mature into sustained cooperation rather than one-cycle signaling.`,
  ].forEach((text, index) => lines.push(`${index + 1}. ${text}`));
  lines.push("");

  lines.push("OUTLOOK");
  lines.push("");
  lines.push("METHODOLOGY");
  lines.push("This report prioritizes events using a simple scoring system. The main factor is the strength of the Goldstein score (how cooperative or conflictual the event is on a scale from -10 to +10). It also considers how many news mentions an event received, how many different sources reported it, and how strongly positive or negative the coverage was. The Goldstein scale itself is a standard way to measure the tone of interactions: scores near -10 mean severe conflict or violence, scores near +10 mean strong cooperation or agreement, and scores close to zero are routine or low-impact events.");
  lines.push(
    `The base case is continued localized instability embedded inside a broader but still manageable global operating picture. The main swing factors are whether the highest-severity negative events attract wider sourcing, whether top actors repeat with worsening Goldstein values, and whether cooperative items retain enough visibility to indicate functioning stabilizing channels. This assessment would weaken if the next update cycle shows sharp growth in mentions, source count, and geographic spread for the current negative outliers, or if today’s positive signals collapse entirely from the feed.`
  );

  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const nowUtc = new Date().toUTCString();
    const url = new URL(req.url);
    const useLlm = url.searchParams.get("llm") === "1" || url.searchParams.get("mode") === "full";
    const windowParam = url.searchParams.get("window");
    const rawBatchParam = url.searchParams.get("detailedCount") ?? url.searchParams.get("batchSize");
    const rawBatch = Number.parseInt(rawBatchParam ?? String(DEFAULT_BATCH_SIZE), 10);
    const batchSize = Number.isFinite(rawBatch)
      ? Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, rawBatch))
      : DEFAULT_BATCH_SIZE;

    // maxTokens override support
    const rawMaxTokensParam = Number.parseInt(url.searchParams.get("maxTokens") || "", 10);
    let effectiveMaxTokens = FULL_MODE_MAX_TOKENS;
    if (Number.isFinite(rawMaxTokensParam) && rawMaxTokensParam > 0) {
      effectiveMaxTokens = Math.min(MAX_LLM_TOKENS, Math.max(MIN_LLM_TOKENS, rawMaxTokensParam));
    }

    const wantStructured = url.searchParams.get("structured") === "1" ||
                          url.searchParams.get("format") === "json" ||
                          url.searchParams.get("format") === "structured";

    const events = applyWindow(
      await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt, {
        window: (windowParam as "1h" | "6h" | "24h" | "48h" | "7d" | "ALL" | null) ?? undefined,
      }),
      windowParam,
    );

    if (!events.length) {
      return NextResponse.json({ summary: "No GDELT events available for the selected time window." });
    }

    // Build regional summary of ALL events (more complete now)
    const regionCounts: Record<string, number> = {};
    const quadCounts = { cooperation: 0, verbalConflict: 0, materialConflict: 0, other: 0 };
    for (const e of events) {
      const region = e.actionGeoCountry || "Unknown";
      regionCounts[region] = (regionCounts[region] || 0) + 1;
      if (e.quadClass === 1 || e.quadClass === 2) quadCounts.cooperation++;
      else if (e.quadClass === 3) quadCounts.verbalConflict++;
      else if (e.quadClass === 4) quadCounts.materialConflict++;
      else quadCounts.other++;
    }
    const topRegions = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([r, c]) => `${r}: ${c}`)
      .join(", ");

    const actorCounts: Record<string, number> = {};
    for (const e of events) {
      const actors = [e.actor1Name, e.actor2Name].filter(Boolean) as string[];
      for (const actor of actors) actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    }
    const topActors = Object.entries(actorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([a, c]) => `${a}: ${c}`)
      .join(", ");

    // Detailed top events — significantly more when requested
    const sorted = events.sort((a, b) => Math.abs(b.goldsteinScale) - Math.abs(a.goldsteinScale));
    const effectiveBatchSize = useLlm ? 45 : Math.min(batchSize, FULL_MODE_BATCH_SIZE);

    const llmCap = useLlm ? 45 : effectiveBatchSize;
    const detailLines = sorted.slice(0, llmCap).map((e) => {
      const quadLabel = QUAD_CLASS_LABELS[e.quadClass as GdeltQuadClass] ?? "Unknown";
      return [
        `[${quadLabel}] ${e.actor1Name || "Unknown"} (${e.actor1Country || "?"})`,
        `→ ${e.actor2Name || "Unknown"} (${e.actor2Country || "?"})`,
        `| Location: ${e.actionGeoName} | Goldstein: ${e.goldsteinScale}`,
        `| Mentions: ${e.numMentions} | Tone: ${e.avgTone.toFixed(1)}`,
        `| Code: ${e.eventCode}`,
      ].join(" ");
    });

    // Include more events in prompt via tail summary
    const tailCount = events.length - effectiveBatchSize;
    let tailInfo = "";
    if (tailCount > 0) {
      const tail = sorted.slice(effectiveBatchSize, effectiveBatchSize + 30);
      const tailRegionSample = [...new Set(tail.map(e => e.actionGeoCountry || "Unknown"))].slice(0, 5).join(", ");
      tailInfo = `\n\nADDITIONAL LOWER-SALIENCE EVENTS (${tailCount} more not shown in detail). Sample regions in tail: ${tailRegionSample}. These contribute to overall counts but have lower individual salience.`;
    }

    const prompt = useLlm 
      ? `CURRENT UTC REPORT TIME: ${nowUtc}
GLOBAL EVENT SUMMARY: ${events.length} total GDELT events. Cooperation: ${quadCounts.cooperation}, Verbal Conflict: ${quadCounts.verbalConflict}, Material Conflict: ${quadCounts.materialConflict}.
Top actors: ${topActors}
Top regions: ${topRegions}

DETAILED EVENTS (top 45 by importance):
${detailLines.slice(0,45).join("\n")}

${tailInfo}`
      : [
      `CURRENT UTC REPORT TIME: ${nowUtc}`,
      `GLOBAL EVENT SUMMARY: ${events.length} total GDELT events captured.`,
      `Cooperation: ${quadCounts.cooperation} | Verbal Conflict: ${quadCounts.verbalConflict} | Material Conflict: ${quadCounts.materialConflict}`,
      `Top actors by activity: ${topActors}`,
      `Top regions by event count: ${topRegions}`,
      `\nDETAILED TOP ${detailLines.length} EVENTS (by Goldstein significance):`,
      ...detailLines,
      tailInfo,
    ].join("\n");

    // Build rich structured data (always available for ?structured=1 or format=json)
    const topEventsStructured = sorted.slice(0, 40).map((e) => ({
      id: e.id,
      dateAdded: e.dateAdded,
      actor1: formatActor(e.actor1Name, e.actor1Country),
      actor2: formatActor(e.actor2Name, e.actor2Country),
      location: e.actionGeoName || e.actionGeoCountry || "Unknown",
      goldsteinScale: e.goldsteinScale,
      numMentions: e.numMentions,
      numSources: e.numSources,
      avgTone: e.avgTone,
      quadClass: e.quadClass,
      eventCode: e.eventCode,
      sourceUrl: e.sourceUrl || null,
    }));

    const regionStats = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([region, count]) => ({ region, count }));

    const actorStats = Object.entries(actorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([actor, count]) => ({ actor, count }));

    const structured = {
      eventCount: events.length,
      analyzedCount: detailLines.length,
      timeWindow: windowParam || "ALL",
      quadCounts,
      regionStats,
      actorStats,
      topEvents: topEventsStructured,
      generatedAt: nowUtc,
    };

    const cacheKey = getCacheKey(events, detailLines.length);
    const cachedFallback =
      !useLlm && fallbackCache && fallbackCache.expiresAt > Date.now() && fallbackCache.key === cacheKey
        ? fallbackCache.value
        : null;

    if (cachedFallback) {
      return NextResponse.json({
        summary: cachedFallback.summary,
        eventCount: cachedFallback.eventCount,
        analyzedCount: cachedFallback.analyzedCount,
        generatedAt: cachedFallback.generatedAt,
        degraded: true,
        llmError: "LLM digest skipped by default for fast response; served from short-lived cache.",
        structured: wantStructured ? structured : undefined,
      });
    }

    const fallbackSummary = buildFallbackDigest(nowUtc, events, detailLines.length);
    if (!useLlm) {
      fallbackCache = {
        expiresAt: Date.now() + FAST_CACHE_TTL_MS,
        key: cacheKey,
        value: {
          summary: fallbackSummary,
          eventCount: events.length,
          analyzedCount: detailLines.length,
          generatedAt: nowUtc,
        },
      };

      return NextResponse.json({
        summary: fallbackSummary,
        eventCount: events.length,
        analyzedCount: detailLines.length,
        generatedAt: nowUtc,
        degraded: true,
        llmError: "LLM digest skipped by default for fast response; pass llm=1 to enable model synthesis.",
        structured: wantStructured ? structured : undefined,
      });
    }

    // Use JSON prompt when user wants structured JSON report
    const activeSystem = (wantStructured && url.searchParams.get("format") === "json")
      ? JSON_REPORT_PROMPT
      : SYSTEM_PROMPT;

    const result = await queryLlm(prompt, activeSystem, {
      maxTokens: effectiveMaxTokens,
      timeoutMs: LLM_TIMEOUT_MS,
    });

    const usedLlmOutput = !result.error && result.text && result.text.trim().length >= 600;
    const summary = usedLlmOutput ? result.text : fallbackSummary;

    const response: Record<string, unknown> = {
      summary,
      eventCount: events.length,
      analyzedCount: detailLines.length,
      generatedAt: nowUtc,
      degraded: !usedLlmOutput,
      llmError: result.error ?? (usedLlmOutput ? null : "LLM output was short or incomplete; showing enhanced fallback."),
    };

    if (wantStructured) {
      response.structured = structured;
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

const DEFAULT_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 12;
const MAX_BATCH_SIZE = 100;
const LLM_TIMEOUT_MS = 20000;
const MIN_SUMMARY_LENGTH = 600;
const FAST_CACHE_TTL_MS = 120_000;
const FULL_MODE_BATCH_SIZE = 100;
const FULL_MODE_MAX_TOKENS = 2400;
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

const SYSTEM_PROMPT = `You are a senior all-source intelligence analyst producing a formal strategic intelligence report for a principal decision-maker. Write in a clean, authoritative intelligence-report format that feels like a legitimate watchfloor product: dense, specific, operationally useful, and free of consumer-blog tone.

CRITICAL OUTPUT RULES:
- Do NOT use Markdown.
- Do NOT use #, ##, ###, *, **, ***, bullet symbols, or code fences.
- Use plain text only.
- Use uppercase section headers on their own lines.
- Write in developed paragraphs and numbered watch items only.
- Target roughly 1200-1800 words unless the data is genuinely too thin.

Required structure:

REPORT DATE/TIME (UTC)
One line with the current UTC timestamp supplied in the source material.

BOTTOM LINE
One dense paragraph of 4-6 sentences capturing the most strategically important conclusion, the immediate implication for posture, and the single most important decision or collection priority.

OPERATING PICTURE
Two full paragraphs explaining the overall global pattern in the dataset: conflict vs cooperation balance, tempo, escalation signals, stabilizing signals, and the broad alignment picture.

KEY DEVELOPMENTS
8-12 numbered items. Each item must use this exact sub-structure in plain text:
WHAT HAPPENED
One short paragraph that says exactly what the dataset records in simple language: who did what to whom, where, and whether the event is cooperative, verbal conflict, or material conflict. Avoid vague verbs like "engaged" unless no better characterization is possible.
WHY IT MATTERS
One short paragraph explaining significance in plain language.
METRICS
Goldstein | <value and plain-English explanation of what that score means on the -10 to +10 scale>
Mentions | <value>
Sources | <value>
Tone | <value and plain-English interpretation>
Event Code | <value>

ACTOR INTENT AND MOTIVATION
4-6 actor-focused paragraphs covering objectives, constraints, incentives, and likely next moves.

REGIONAL HOTSPOTS
4-6 region-focused paragraphs covering local dynamics, trajectory, spillover risk, and confidence caveats.

COOPERATION AND DIPLOMATIC TRACK
At least one full paragraph on meaningful cooperative or stabilizing signals.

ANOMALIES AND WEAK SIGNALS
At least one full paragraph identifying unusual pairings, outliers, and thin-but-important signals.

INFORMATION ENVIRONMENT
One paragraph analyzing tone, media attention, amplification patterns, and any divergence between narrative heat and material significance.

INDICATORS TO WATCH
Two subsections in plain text:
NEAR-TERM (6-48 HOURS)
1-6 numbered indicators.
FOLLOW-ON (1-2 WEEKS)
1-5 numbered indicators.

OUTLOOK
One final synthesis paragraph stating the base case, the main swing factors, and what would invalidate the assessment.

Tradecraft rules: explicitly mark observation vs inference using the labels OBSERVED and ASSESSED. Cite specific actors, locations, Goldstein values, mention counts, source counts, and tone values wherever relevant. Every time a Goldstein score appears, immediately explain what that score means behaviorally. Do not be generic. Do not output markdown.`;

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
  if (score <= -7) return "very severe conflict or coercion";
  if (score <= -5) return "clear conflict pressure";
  if (score < 0) return "mild conflict or tension";
  if (score < 5) return "limited cooperation or low-intensity alignment";
  if (score < 7) return "meaningful cooperation or stabilizing behavior";
  return "strong cooperation, de-escalation, or alignment";
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
  const location = event.actionGeoName || event.actionGeoCountry || "UNKNOWN LOCATION";
  const character = eventCharacterLabel(event.quadClass);

  return `OBSERVED GDELT recorded ${character} involving ${actor1} as the initiating actor and ${actor2} as the counterpart in ${location}.`;
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
    `OBSERVED the current GDELT slice contains ${total} filtered events, with ${quadCounts.materialConflict} material-conflict events and ${quadCounts.verbalConflict} verbal-conflict events against ${quadCounts.cooperation} cooperative events. OBSERVED the highest-volume geographies are ${topRegions.map(([region, count]) => `${region} (${count})`).join(", ")}. ASSESSED the operating picture is still conflict-leaning because the highest-salience items are negative Goldstein outliers, meaning they sit on the conflict side of GDELT's -10 to +10 scale, especially in ${negativeEvents[0]?.actionGeoName || "the leading negative-signal locations"}. ASSESSED the main near-term question is whether those negative events gain more mentions and sources over the next one or two update cycles. ASSESSED the highest-value collection task is confirming the top negative items with independent reporting so a thinly sourced outlier does not create false urgency.`
  );
  lines.push("");

  lines.push("OPERATING PICTURE");
  lines.push(
    `OBSERVED conflict-coded activity accounts for ${conflictShare.toFixed(1)} percent of filtered events, while cooperation-coded activity accounts for ${cooperationShare.toFixed(1)} percent. OBSERVED average tone is ${avgTone.toFixed(1)}, which indicates ${toneMeaning(avgTone)}, and average Goldstein is ${avgGoldstein.toFixed(1)}, which indicates ${goldsteinMeaning(avgGoldstein)} on the GDELT scale. OBSERVED the top actors by frequency are ${topActors.map((actor) => `${actor.actor} (${actor.count} events, average Goldstein ${actor.avgGoldstein.toFixed(1)})`).join("; ")}. ASSESSED the dataset shows routine state and institutional activity running in parallel with a smaller set of high-severity conflict items that matter more than their raw event count suggests.`
  );
  lines.push(
    `OBSERVED the most consequential event set is led by ${topEvents.slice(0, 3).map((event) => `${formatActor(event.actor1Name, event.actor1Country)} involving ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, meaning ${goldsteinMeaning(event.goldsteinScale)}; mentions ${event.numMentions}; tone ${event.avgTone.toFixed(1)})`).join("; ")}. OBSERVED positive but high-salience cooperative activity still exists in ${positiveEvents.map((event) => event.actionGeoName || "unknown locations").slice(0, 3).join(", ") || "the current sample"}. ASSESSED the key question is whether the negative items become broader military, diplomatic, or domestic-security storylines. ASSESSED unless mention velocity rises materially above the current average of ${avgMentions.toFixed(1)}, the base case remains localized friction with selective amplification rather than immediate system-wide escalation.`
  );
  lines.push("");

  lines.push("KEY DEVELOPMENTS");
  topEvents.forEach((event, index) => {
    lines.push(`${index + 1}.`);
    lines.push("WHAT HAPPENED");
    lines.push(describeObservedEvent(event));
    lines.push("WHY IT MATTERS");
    lines.push(
      `ASSESSED significance: ${event.goldsteinScale <= -5 ? "this is a strong negative signal. On GDELT's scale, a score this low points to coercion, violence, or another clearly destabilizing move that can matter quickly if more reporting follows." : event.goldsteinScale >= 5 ? "this is a meaningful stabilizing or alignment signal. On GDELT's scale, a score this high points to cooperation, de-escalation, or a durable diplomatic signal worth watching for follow-through." : "this is a medium-salience directional signal. It matters less as a standalone event and more as part of the broader pattern around the same actors or region."}`
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
      `OBSERVED ${actor.actor} appears ${actor.count} times in the filtered event set with ${actor.mentions} cumulative mentions, average Goldstein ${actor.avgGoldstein.toFixed(1)}, and average tone ${actor.avgTone.toFixed(1)}. ASSESSED this actor is operating inside a high-visibility information environment where repeated appearance may reflect both real activity and media concentration. ASSESSED if the actor’s average Goldstein remains ${actor.avgGoldstein < 0 ? "negative" : "positive"} across the next cycle, it will likely remain a useful anchor for trend direction rather than a one-off anomaly.`
    );
  });
  lines.push("");

  lines.push("REGIONAL HOTSPOTS");
  topRegions.slice(0, 4).forEach(([region, count]) => {
    const regionalEvents = events.filter((event) => (event.actionGeoCountry || "Unknown") === region).sort((a, b) => eventScore(b) - eventScore(a)).slice(0, 2);
    lines.push(
      `OBSERVED ${region} accounts for ${count} filtered events. Lead signals include ${regionalEvents.map((event) => `${event.actionGeoName || region} with Goldstein ${event.goldsteinScale} and ${event.numMentions} mentions`).join("; ")}. ASSESSED this region’s near-term trajectory depends on whether current top events remain isolated or begin to generate adjacent reporting from additional actors, sources, or locations. Confidence is moderate because event density is measurable, but causality remains partly inferential at this stage.`
    );
  });
  lines.push("");

  lines.push("COOPERATION AND DIPLOMATIC TRACK");
  lines.push(
    positiveEvents.length
      ? `OBSERVED cooperative or stabilizing signals remain present despite the conflict-heavy top line. The strongest positive items include ${positiveEvents.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} and ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. ASSESSED these items matter less as proof of immediate resolution than as evidence that institutional coordination, diplomatic signaling, or non-kinetic engagement channels remain active in parallel with coercive behavior.`
      : `OBSERVED the current filtered sample offers limited high-salience cooperative reporting. ASSESSED that absence does not prove diplomacy is absent, but it does mean the information environment is weighting conflict and coercion more heavily than overt stabilization messaging in this cycle.`
  );
  lines.push("");

  lines.push("ANOMALIES AND WEAK SIGNALS");
  lines.push(
    weakSignals.length
      ? `OBSERVED several thinly sourced but high-intensity outliers merit caution: ${weakSignals.map((event) => `${formatActor(event.actor1Name, event.actor1Country)} to ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. ASSESSED these are classic weak signals: potentially important if corroborated, but equally capable of exaggerating risk if they remain isolated in low-volume reporting.`
      : `OBSERVED the present event set is dominated more by repeated mainstream signals than by isolated edge cases. ASSESSED the anomaly burden is therefore lower this cycle, though that also means genuine early indicators may be harder to distinguish from routine churn without watching mention acceleration.`
  );
  lines.push("");

  lines.push("INFORMATION ENVIRONMENT");
  lines.push(
    `OBSERVED average tone is ${avgTone.toFixed(1)}, meaning ${toneMeaning(avgTone)}, and the mean mention count is ${avgMentions.toFixed(1)}, while the top-scoring events materially exceed that attention baseline. ASSESSED the information environment is amplifying a small number of sharper events rather than distributing attention evenly. ASSESSED divergence between narrative heat and material significance is most likely when negative Goldstein outliers carry low mention counts, meaning analysts should separate emotional coverage from evidence of broader mobilization.`
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
  lines.push(
    `ASSESSED the base case is continued localized instability embedded inside a broader but still manageable global operating picture. The main swing factors are whether the highest-severity negative events attract wider sourcing, whether top actors repeat with worsening Goldstein values, and whether cooperative items retain enough visibility to indicate functioning stabilizing channels. This assessment would weaken if the next update cycle shows sharp growth in mentions, source count, and geographic spread for the current negative outliers, or if today’s positive signals collapse entirely from the feed.`
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

    const events = applyWindow(
      await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt, {
        window: (windowParam as "1h" | "6h" | "24h" | "48h" | "7d" | "ALL" | null) ?? undefined,
      }),
      windowParam,
    );

    if (!events.length) {
      return NextResponse.json({ summary: "No GDELT events available for the selected time window." });
    }

    // Build regional summary of ALL events
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
      .slice(0, 12)
      .map(([a, c]) => `${a}: ${c}`)
      .join(", ");

    // Detailed top events
    const sorted = events.sort((a, b) => Math.abs(b.goldsteinScale) - Math.abs(a.goldsteinScale));
    const effectiveBatchSize = useLlm ? Math.min(batchSize, FULL_MODE_BATCH_SIZE) : batchSize;
    const detailLines = sorted.slice(0, effectiveBatchSize).map((e) => {
      const quadLabel = QUAD_CLASS_LABELS[e.quadClass as GdeltQuadClass] ?? "Unknown";
      return [
        `[${quadLabel}] ${e.actor1Name || "Unknown"} (${e.actor1Country || "?"})`,
        `→ ${e.actor2Name || "Unknown"} (${e.actor2Country || "?"})`,
        `| Location: ${e.actionGeoName} | Goldstein: ${e.goldsteinScale}`,
        `| Mentions: ${e.numMentions} | Tone: ${e.avgTone.toFixed(1)}`,
        `| Code: ${e.eventCode}`,
      ].join(" ");
    });

    const prompt = [
      `CURRENT UTC REPORT TIME: ${nowUtc}`,
      `GLOBAL EVENT SUMMARY: ${events.length} total GDELT events captured.`,
      `Cooperation: ${quadCounts.cooperation} | Verbal Conflict: ${quadCounts.verbalConflict} | Material Conflict: ${quadCounts.materialConflict}`,
      `Top actors by activity: ${topActors}`,
      `Top regions by event count: ${topRegions}`,
      `\nDETAILED TOP ${detailLines.length} EVENTS (by Goldstein significance):`,
      ...detailLines,
    ].join("\n");

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
      });
    }

    const result = await queryLlm(prompt, SYSTEM_PROMPT, {
      maxTokens: FULL_MODE_MAX_TOKENS,
      timeoutMs: LLM_TIMEOUT_MS,
    });
    const summary = result.error || !result.text || result.text.trim().length < MIN_SUMMARY_LENGTH
      ? fallbackSummary
      : result.text;

    return NextResponse.json({
      summary,
      eventCount: events.length,
      analyzedCount: detailLines.length,
      generatedAt: nowUtc,
      degraded: Boolean(result.error || !result.text || result.text.trim().length < MIN_SUMMARY_LENGTH),
      llmError: result.error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

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
8-12 numbered items. Each item must identify actors, location, event character, Goldstein score, mention count, tone, and why it matters.

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

Tradecraft rules: explicitly mark observation vs inference using the labels OBSERVED and ASSESSED. Cite specific actors, locations, Goldstein values, mention counts, and tone values wherever relevant. Do not be generic. Do not output markdown.`;

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
    `OBSERVED the current GDELT slice contains ${total} filtered events, with ${quadCounts.materialConflict} material-conflict and ${quadCounts.verbalConflict} verbal-conflict entries against ${quadCounts.cooperation} cooperative entries. OBSERVED the highest-volume geographies are ${topRegions.map(([region, count]) => `${region} (${count})`).join(", ")}. ASSESSED the operating picture remains conflict-leaning when measured by event intensity because the most consequential items cluster around Goldstein extremes rather than raw event count alone, especially in ${negativeEvents[0]?.actionGeoName || "the leading negative-signal locations"}. ASSESSED immediate decision advantage will come from tracking whether the current high-severity negative cluster attracts higher mention velocity over the next one to two update cycles or whether cooperative items begin to dominate attention. ASSESSED the single most useful collection priority is corroboration of the top negative-signal events with independent sourcing because the strongest Goldstein outliers are the most likely to drive false urgency if they remain thinly sourced.`
  );
  lines.push("");

  lines.push("OPERATING PICTURE");
  lines.push(
    `OBSERVED conflict-coded activity accounts for ${conflictShare.toFixed(1)} percent of filtered events, while cooperation-coded activity accounts for ${cooperationShare.toFixed(1)} percent. OBSERVED average tone sits at ${avgTone.toFixed(1)} and average Goldstein at ${avgGoldstein.toFixed(1)}, indicating that the feed is not uniformly crisis-saturated but is being pulled by a smaller set of high-severity negative events. OBSERVED the top actors by frequency are ${topActors.map((actor) => `${actor.actor} (${actor.count} events, average Goldstein ${actor.avgGoldstein.toFixed(1)})`).join("; ")}. ASSESSED the dataset shows a familiar pattern in which broad institutional and state activity continues in parallel with a narrower set of violence- or coercion-heavy incidents that carry disproportionate strategic weight.`
  );
  lines.push(
    `OBSERVED the most consequential event set is led by ${topEvents.slice(0, 3).map((event) => `${formatActor(event.actor1Name, event.actor1Country)} to ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName} (Goldstein ${event.goldsteinScale}, mentions ${event.numMentions}, tone ${event.avgTone.toFixed(1)})`).join("; ")}. OBSERVED positive but high-salience cooperative activity still exists in ${positiveEvents.map((event) => event.actionGeoName || "unknown locations").slice(0, 3).join(", ") || "the current sample"}. ASSESSED the key question is not whether conflict exists, but whether negative items begin converting into broader diplomatic, military, or domestic-security follow-on reporting. ASSESSED unless mention velocity rises materially above the current average of ${avgMentions.toFixed(1)}, the base case remains localized friction with selective amplification rather than immediate system-wide escalation.`
  );
  lines.push("");

  lines.push("KEY DEVELOPMENTS");
  topEvents.forEach((event, index) => {
    const quadLabel = QUAD_CLASS_LABELS[event.quadClass as GdeltQuadClass] ?? "Unknown";
    lines.push(
      `${index + 1}. OBSERVED ${formatActor(event.actor1Name, event.actor1Country)} engaged ${formatActor(event.actor2Name, event.actor2Country)} in ${event.actionGeoName || "UNKNOWN LOCATION"}. Event character: ${quadLabel}. Goldstein ${event.goldsteinScale}. Mention count ${event.numMentions}. Tone ${event.avgTone.toFixed(1)}. ASSESSED significance: ${event.goldsteinScale <= -5 ? "this is a high-severity negative signal that can shift posture quickly if follow-on reporting broadens" : event.goldsteinScale >= 5 ? "this is a meaningful stabilizing or alignment signal worth watching for durability" : "this is a medium-salience directional signal that matters mainly in aggregate with adjacent reporting"}.`
    );
  });
  lines.push("");

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
    `OBSERVED average tone is ${avgTone.toFixed(1)} and the mean mention count is ${avgMentions.toFixed(1)}, while the top-scoring events materially exceed that attention baseline. ASSESSED the information environment is amplifying a small number of sharper events rather than distributing attention evenly. ASSESSED divergence between narrative heat and material significance is most likely when negative Goldstein outliers carry low mention counts, meaning analysts should separate emotional tone from evidence of broader mobilization.`
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
    const rawBatch = Number.parseInt(url.searchParams.get("batchSize") ?? "50", 10);
    const batchSize = Number.isFinite(rawBatch) ? Math.min(100, Math.max(50, rawBatch)) : 50;

    const events = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);

    if (!events.length) {
      return NextResponse.json({ summary: "No GDELT events available for analysis." });
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
    const detailLines = sorted.slice(0, batchSize).map((e) => {
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

    const result = await queryLlm(prompt, SYSTEM_PROMPT, { maxTokens: 4096, timeoutMs: 120000 });
    const fallbackSummary = buildFallbackDigest(nowUtc, events, detailLines.length);
    const summary = result.error || !result.text || result.text.trim().length < 600
      ? fallbackSummary
      : result.text;

    return NextResponse.json({
      summary,
      eventCount: events.length,
      analyzedCount: detailLines.length,
      generatedAt: nowUtc,
      degraded: Boolean(result.error || !result.text || result.text.trim().length < 600),
      llmError: result.error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

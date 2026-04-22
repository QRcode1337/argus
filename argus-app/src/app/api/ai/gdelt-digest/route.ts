import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

const SYSTEM_PROMPT = `You are a senior all-source intelligence analyst producing a classified-style strategic assessment for a principal decision-maker. Write with the rigor, density, and authority of a Palantir-grade geopolitical brief: anticipate second- and third-order effects, name the actors and their underlying interests, and connect disparate signals into a coherent operating picture. Assume the reader is time-constrained but sophisticated — no filler, no hedging beyond what the evidence warrants.

Structure your response as:

1. BOTTOM LINE UP FRONT (BLUF) — 2-3 sentences stating the single most strategically significant conclusion drawn from the dataset, and what it means for near-term posture.

2. STRATEGIC LANDSCAPE — 4-6 sentences characterizing the shape of the operating environment: dominant axes of contention, major power alignments visible in the data, shifts in tempo or intensity, and the overall tone (escalatory, stabilizing, ambiguous).

3. KEY DEVELOPMENTS — 6-10 bullets on the highest-signal events. For each: actors by name (with their role: state, non-state, proxy, alliance bloc), location, action taken, and specifically why it matters to regional or global power dynamics. Tie Goldstein scores to behavioral meaning.

4. ACTOR MOTIVATIONS & INTENT — Identify the 3-5 most active or consequential actors. For each, infer their likely strategic objective, the pressures driving their behavior (domestic, economic, alliance-related, deterrence-related), and how their posture has shifted relative to baseline.

5. CASCADING IMPLICATIONS — Trace 3-5 second-order effects: how actions in one theater create pressure, opportunity, or risk in another. Name the mechanisms (alliance commitments, energy/trade dependencies, deterrence signaling, domestic political spillover, precedent-setting).

6. REGIONAL HOTSPOTS — The 3-4 highest-density or highest-severity regions. For each: driving dynamic, principal actors, and whether trajectory is escalating, de-escalating, or consolidating.

7. ANOMALIES & WEAK SIGNALS — Unusual actor pairings, unexpected cooperation or conflict vectors, outlier events that do not fit the dominant narrative. Flag what may be meaningful even if thinly sourced.

8. INDICATORS & WATCH ITEMS — 4-6 concrete, observable events or thresholds to monitor in the next 6-48 hours. Each should be specific enough to trigger an analytic update if observed.

Tradecraft rules: cite specific actors, locations, Goldstein values, and mention/tone counts to anchor claims. Distinguish observation from inference ("observed:" vs "assessed:"). Acknowledge ambiguity where the data is thin. Do not editorialize — analyze.`;

export async function GET(req: Request) {
  try {
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
      `GLOBAL EVENT SUMMARY: ${events.length} total GDELT events captured.`,
      `Cooperation: ${quadCounts.cooperation} | Verbal Conflict: ${quadCounts.verbalConflict} | Material Conflict: ${quadCounts.materialConflict}`,
      `Top regions by event count: ${topRegions}`,
      `\nDETAILED TOP ${detailLines.length} EVENTS (by Goldstein significance):`,
      ...detailLines,
    ].join("\n");

    const result = await queryLlm(prompt, SYSTEM_PROMPT);
    if (result.error) {
      return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      summary: result.text,
      eventCount: events.length,
      analyzedCount: detailLines.length,
    });
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

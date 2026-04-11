import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

const SYSTEM_PROMPT = `You are a senior geopolitical intelligence analyst producing an operational intelligence brief. Structure your response as:

1. SITUATION OVERVIEW (3-4 sentences on the overall global picture based on ALL event patterns)
2. KEY DEVELOPMENTS (bullet the 5-8 most significant events, with actor names, locations, and strategic significance)
3. CONFLICT INDICATORS (all material conflict events, deeply negative Goldstein scores, military actions)
4. COOPERATION SIGNALS (diplomatic meetings, agreements, positive signals)
5. REGIONAL HOTSPOTS (identify the 3-4 regions with highest event density or severity)
6. PATTERN ANALYSIS (what patterns emerge from the full dataset — escalation trends, new actor pairs, unusual activity)
7. ASSESSMENT & WATCH ITEMS (3-5 specific things to monitor in the next 6-24 hours)

Be direct, factual, and focused on strategic significance. Reference specific actors, locations, and Goldstein scores. Note event counts per region.`;

export async function GET() {
  try {
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
    const detailLines = sorted.slice(0, 50).map((e) => {
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

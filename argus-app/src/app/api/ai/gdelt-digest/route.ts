import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import { ARGUS_CONFIG } from "@/lib/config";
import { QUAD_CLASS_LABELS, type GdeltQuadClass } from "@/types/gdelt";

const SYSTEM_PROMPT = `You are a senior geopolitical intelligence analyst. Produce a concise strategic digest of the following GDELT event data. Structure your response as:

1. SITUATION OVERVIEW (2-3 sentences on the overall picture)
2. KEY DEVELOPMENTS (bullet the 3-5 most significant events, with actor names, locations, and why they matter)
3. CONFLICT INDICATORS (note any material conflict events or deeply negative Goldstein scores)
4. COOPERATION SIGNALS (note any material cooperation or positive diplomatic signals)
5. ASSESSMENT (1-2 sentences on what to watch next)

Be direct, factual, and focused on strategic significance. Reference specific actors and locations.`;

export async function GET() {
  try {
    const events = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);

    if (!events.length) {
      return NextResponse.json({ summary: "No GDELT events available for analysis." });
    }

    const eventLines = events
      .sort((a, b) => Math.abs(b.goldsteinScale) - Math.abs(a.goldsteinScale))
      .slice(0, 40)
      .map((e) => {
        const quadLabel = QUAD_CLASS_LABELS[e.quadClass as GdeltQuadClass] ?? "Unknown";
        return [
          `[${quadLabel}] ${e.actor1Name || "Unknown"} (${e.actor1Country || "?"})`,
          `→ ${e.actor2Name || "Unknown"} (${e.actor2Country || "?"})`,
          `| Location: ${e.actionGeoName} | Goldstein: ${e.goldsteinScale}`,
          `| Mentions: ${e.numMentions} | Tone: ${e.avgTone.toFixed(1)}`,
          `| Code: ${e.eventCode}`,
        ].join(" ");
      });

    const prompt = `Analyze these ${events.length} GDELT events (showing top ${eventLines.length} by significance):\n\n${eventLines.join("\n")}`;

    const result = await queryLlm(prompt, SYSTEM_PROMPT);
    if (result.error) {
      return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      summary: result.text,
      eventCount: events.length,
      analyzedCount: eventLines.length,
    });
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

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
    if (result.error) {
      return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      summary: result.text,
      eventCount: events.length,
      analyzedCount: detailLines.length,
      generatedAt: nowUtc,
    });
  } catch (error) {
    return NextResponse.json(
      { summary: null, error: error instanceof Error ? error.message : "Failed to generate digest" },
      { status: 500 },
    );
  }
}

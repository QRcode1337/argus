import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { getPneumaInstance } from "@/lib/ai/llmClient";

/**
 * GET /api/pneuma/state
 *
 * Returns PNEUMA's current cognitive state for the HUD overlay.
 * Reads from the same singleton instance used by /api/ai/summarize.
 */

export async function GET() {
  const { llm } = await readSettings();

  if (llm.provider !== "pneuma") {
    return NextResponse.json({
      isActive: false,
      phi: 0,
      moodRegime: "unknown",
      memoryNodes: 0,
      cycleCount: 0,
      pipelineTimeMs: 0,
    });
  }

  let pneuma: any;
  try {
    pneuma = await getPneumaInstance();
  } catch {
    pneuma = null;
  }

  if (!pneuma || !pneuma.isInitialized) {
    return NextResponse.json({
      isActive: true,
      phi: 0,
      moodRegime: "exploratory-curious",
      memoryNodes: 0,
      cycleCount: 0,
      pipelineTimeMs: 0,
    });
  }

  try {
    const phiRouter = pneuma.getPhiRouter();
    const moodRegime = pneuma.getMoodRegime();
    const memoryGraph = pneuma.getMemoryGraph();

    return NextResponse.json({
      isActive: true,
      phi: phiRouter.getLatestPhi()?.value ?? 0,
      moodRegime: moodRegime.currentRegime ?? "exploratory-curious",
      memoryNodes: memoryGraph.size ?? 0,
      cycleCount: pneuma.getCycleCount(),
      pipelineTimeMs: 0,
    });
  } catch {
    return NextResponse.json({
      isActive: true,
      phi: 0,
      moodRegime: "exploratory-curious",
      memoryNodes: 0,
      cycleCount: pneuma.getCycleCount?.() ?? 0,
      pipelineTimeMs: 0,
    });
  }
}

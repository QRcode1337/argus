import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";

/**
 * GET /api/pneuma/state
 *
 * Returns PNEUMA's current cognitive state for the HUD overlay.
 */

// Local singleton for the HUD route.
let pneumaInstance: any = null;

async function getPneumaInstance(): Promise<any> {
  if (!pneumaInstance) {
    try {
      const { PNEUMA } = await import("@/lib/pneuma/pneuma");
      pneumaInstance = new PNEUMA();
      pneumaInstance.initialize();
    } catch {
      return null;
    }
  }
  return pneumaInstance;
}

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

  const pneuma = await getPneumaInstance();

  if (!pneuma) {
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

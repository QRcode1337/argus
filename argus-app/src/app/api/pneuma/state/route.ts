import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { getPneumaInstance } from "@/lib/ai/llmClient";
import { logPneumaLatency } from "@/lib/telemetry/pneumaLatencyLogger";

/**
 * GET /api/pneuma/state
 *
 * Returns PNEUMA's current cognitive state for the HUD overlay.
 * Reads from the same singleton instance used by /api/ai/summarize.
 */

export async function GET() {
  const start = performance.now();
  const { llm } = await readSettings();

  if (llm.provider !== "pneuma") {
    const latency_ms = Math.round(performance.now() - start);
    logPneumaLatency({
      route: "/api/pneuma/state",
      context: null,
      latency_ms,
      status_code: 200,
    }).catch(console.error);
    return NextResponse.json({
      isActive: false,
      phi: 0,
      moodRegime: "unknown",
      memoryNodes: 0,
      cycleCount: 0,
      pipelineTimeMs: latency_ms,
    });
  }

  let pneuma: any;
  try {
    pneuma = await getPneumaInstance();
  } catch {
    pneuma = null;
  }

  if (!pneuma || !pneuma.isInitialized) {
    const latency_ms = Math.round(performance.now() - start);
    logPneumaLatency({
      route: "/api/pneuma/state",
      context: null,
      latency_ms,
      status_code: 200,
    }).catch(console.error);
    return NextResponse.json({
      isActive: true,
      phi: 0,
      moodRegime: "exploratory-curious",
      memoryNodes: 0,
      cycleCount: 0,
      pipelineTimeMs: latency_ms,
    });
  }

  try {
    const phiRouter = pneuma.getPhiRouter();
    const moodRegime = pneuma.getMoodRegime();
    const memoryGraph = pneuma.getMemoryGraph();

    const latency_ms = Math.round(performance.now() - start);
    logPneumaLatency({
      route: "/api/pneuma/state",
      context: null,
      latency_ms,
      status_code: 200,
    }).catch(console.error);

    return NextResponse.json({
      isActive: true,
      phi: phiRouter.getLatestPhi()?.value ?? 0,
      moodRegime: moodRegime.regimeLabels?.[moodRegime.currentRegime] ?? "exploratory-curious",
      memoryNodes: memoryGraph.size ?? 0,
      cycleCount: pneuma.getCycleCount(),
      pipelineTimeMs: latency_ms,
    });
  } catch {
    const latency_ms = Math.round(performance.now() - start);
    logPneumaLatency({
      route: "/api/pneuma/state",
      context: null,
      latency_ms,
      status_code: 200,
    }).catch(console.error);
    return NextResponse.json({
      isActive: true,
      phi: 0,
      moodRegime: "exploratory-curious",
      memoryNodes: 0,
      cycleCount: pneuma.getCycleCount?.() ?? 0,
      pipelineTimeMs: latency_ms,
    });
  }
}

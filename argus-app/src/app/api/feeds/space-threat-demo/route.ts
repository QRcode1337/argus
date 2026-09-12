import {
  SPACE_THREAT_SCENARIO,
  findObservationByArtifactId,
  fuseSpaceThreatScenario,
} from "@/lib/spaceThreat/demoScenario";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type EvaluationRequest = {
  scenarioId?: unknown;
  throughSequence?: unknown;
  runId?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artifactId = searchParams.get("artifact");

  if (artifactId) {
    const observation = findObservationByArtifactId(artifactId);
    if (!observation) {
      return Response.json({ error: "Synthetic artifact not found" }, { status: 404, headers: NO_STORE_HEADERS });
    }

    return Response.json(
      {
        marking: SPACE_THREAT_SCENARIO.marking,
        scenarioId: SPACE_THREAT_SCENARIO.id,
        observationId: observation.id,
        lineage: observation.lineage,
        payload: observation.rawPayload,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    {
      scenario: SPACE_THREAT_SCENARIO,
      assessment: fuseSpaceThreatScenario(0),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  let body: EvaluationRequest;
  try {
    body = (await request.json()) as EvaluationRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (body.scenarioId !== SPACE_THREAT_SCENARIO.id) {
    return Response.json({ error: "Unknown scenarioId" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (
    !Number.isInteger(body.throughSequence) ||
    Number(body.throughSequence) < 1 ||
    Number(body.throughSequence) > SPACE_THREAT_SCENARIO.observations.length
  ) {
    return Response.json(
      { error: `throughSequence must be an integer from 1 to ${SPACE_THREAT_SCENARIO.observations.length}` },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const runId = typeof body.runId === "string" && body.runId.length <= 100 ? body.runId : "unspecified";
  const receivedAt = new Date().toISOString();
  const fusionStartedAt = performance.now();
  const assessment = fuseSpaceThreatScenario(Number(body.throughSequence));
  const fusionMs = performance.now() - fusionStartedAt;
  const visibleObservations = SPACE_THREAT_SCENARIO.observations.filter(
    (observation) => observation.sequence <= Number(body.throughSequence),
  );

  return Response.json(
    {
      runId,
      receivedAt,
      completedAt: new Date().toISOString(),
      serverTiming: { fusionMs },
      scenarioId: SPACE_THREAT_SCENARIO.id,
      observation: visibleObservations.at(-1),
      visibleObservations,
      assessment,
    },
    {
      headers: {
        ...NO_STORE_HEADERS,
        "Server-Timing": `fusion;dur=${fusionMs.toFixed(3)}`,
      },
    },
  );
}

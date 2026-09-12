export type EvidenceStance = "supports" | "contradicts" | "inconclusive";

export type ConfidenceBand = "low" | "contested" | "elevated" | "high";

export type DisplayPosition = {
  latDeg: number;
  lonDeg: number;
  altitudeKm: number;
};

export type EvidenceTransform = {
  step: string;
  implementation: string;
};

export type EvidenceLineage = {
  artifactId: string;
  sourceId: string;
  publisher: string;
  collectionMethod: string;
  artifactUrl: string;
  referenceUrl?: string;
  sha256: string;
  synthetic: true;
  generatedBy: string;
  schemaVersion: string;
  transforms: EvidenceTransform[];
};

export type SpaceThreatObservation = {
  id: string;
  sequence: number;
  observedAt: string;
  arrivalOffsetMs: number;
  objectId: string;
  sourceName: string;
  modality: "CATALOG" | "EO/IR" | "RADAR";
  stance: EvidenceStance;
  summary: string;
  rationale: string;
  predictedMissDistanceKm: number;
  uncertaintyKm: number;
  reliability: number;
  quality: number;
  relevance: number;
  independence: number;
  displayPosition: DisplayPosition;
  lineage: EvidenceLineage;
  rawPayload: Record<string, unknown>;
};

export type SpaceThreatScenario = {
  id: string;
  name: string;
  marking: "UNCLASSIFIED // SYNTHETIC";
  hypothesis: string;
  priorProbability: number;
  tca: string;
  keepOutRadiusKm: number;
  protectedObject: {
    id: string;
    name: string;
    displayPosition: DisplayPosition;
  };
  suspectObject: {
    id: string;
    name: string;
  };
  observations: readonly SpaceThreatObservation[];
};

export type ConfidenceContribution = {
  observationId: string;
  stance: EvidenceStance;
  effectiveWeight: number;
  logOddsDelta: number;
  priorConfidence: number;
  posteriorConfidence: number;
  rationale: string;
};

export type SpaceThreatAssessment = {
  claimId: string;
  priorProbability: number;
  confidence: number;
  confidenceBand: ConfidenceBand;
  supportWeight: number;
  contradictionWeight: number;
  conflictRatio: number;
  evaluatedObservationIds: string[];
  contributions: ConfidenceContribution[];
  reasoning: string[];
};

const FUSION_GAIN = 1.25;
const MIN_PROBABILITY = 0.000_001;
const MAX_PROBABILITY = 0.999_999;

export const SPACE_THREAT_SCENARIO: SpaceThreatScenario = {
  id: "synthetic-leo-keepout-001",
  name: "LEO keep-out volume crossing",
  marking: "UNCLASSIFIED // SYNTHETIC",
  hypothesis:
    "SYN-90002 will enter the 15 km keep-out volume around SYN-90001 at time of closest approach.",
  priorProbability: 0.3,
  tca: "2026-09-12T14:36:30.000Z",
  keepOutRadiusKm: 15,
  protectedObject: {
    id: "SYN-90001",
    name: "Protected mission asset",
    displayPosition: {
      latDeg: 8.82,
      lonDeg: -154.02,
      altitudeKm: 551.2,
    },
  },
  suspectObject: {
    id: "SYN-90002",
    name: "Uncorrelated resident space object",
  },
  observations: [
    {
      id: "obs-catalog-01",
      sequence: 1,
      observedAt: "2026-09-12T14:32:00.000Z",
      arrivalOffsetMs: 0,
      objectId: "SYN-90002",
      sourceName: "Synthetic catalog adapter",
      modality: "CATALOG",
      stance: "supports",
      summary: "Propagated catalog state projects an 11.8 km miss distance at TCA.",
      rationale: "The projected miss distance falls inside the declared 15 km keep-out volume.",
      predictedMissDistanceKm: 11.8,
      uncertaintyKm: 4.6,
      reliability: 0.78,
      quality: 0.82,
      relevance: 0.95,
      independence: 1,
      displayPosition: {
        latDeg: 7.92,
        lonDeg: -155.38,
        altitudeKm: 548.9,
      },
      lineage: {
        artifactId: "artifact-catalog-01",
        sourceId: "SYN-CATALOG-ALPHA",
        publisher: "ARGUS Scenario Lab",
        collectionMethod: "Synthetic TLE-derived ephemeris",
        artifactUrl: "/api/feeds/space-threat-demo?artifact=artifact-catalog-01",
        referenceUrl: "https://celestrak.org/NORAD/documentation/gp-data-formats.php",
        sha256: "f0d1e0635bd55fdfdd2344395f82e8703758b5f20edee5dde1f8d2ca5b0c89cb",
        synthetic: true,
        generatedBy: "argus-space-demo-fixture@1",
        schemaVersion: "argus.observation.v1",
        transforms: [
          { step: "normalize", implementation: "catalog-adapter@1" },
          { step: "project", implementation: "synthetic-orbit-model@1" },
        ],
      },
      rawPayload: {
        catalogObject: "SYN-90002",
        referenceObject: "SYN-90001",
        tca: "2026-09-12T14:36:30.000Z",
        predictedMissDistanceKm: 11.8,
        covarianceModel: "synthetic-diagonal-v1",
      },
    },
    {
      id: "obs-eo-02",
      sequence: 2,
      observedAt: "2026-09-12T14:32:18.000Z",
      arrivalOffsetMs: 1_200,
      objectId: "SYN-90002",
      sourceName: "Synthetic EO telescope 07",
      modality: "EO/IR",
      stance: "supports",
      summary: "Independent optical track refines the projected miss distance to 9.6 ± 2.2 km.",
      rationale: "The optical angular track independently supports entry into the keep-out volume.",
      predictedMissDistanceKm: 9.6,
      uncertaintyKm: 2.2,
      reliability: 0.86,
      quality: 0.9,
      relevance: 0.95,
      independence: 1,
      displayPosition: {
        latDeg: 8.21,
        lonDeg: -154.91,
        altitudeKm: 549.8,
      },
      lineage: {
        artifactId: "artifact-eo-02",
        sourceId: "SYN-EO-07",
        publisher: "ARGUS Scenario Lab",
        collectionMethod: "Synthetic electro-optical angle track",
        artifactUrl: "/api/feeds/space-threat-demo?artifact=artifact-eo-02",
        sha256: "a7c8ae8bcc92192d99303deea8b3b1cd0edf057dbd4e6ca3d909e96ae1f88712",
        synthetic: true,
        generatedBy: "argus-space-demo-fixture@1",
        schemaVersion: "argus.observation.v1",
        transforms: [
          { step: "calibrate", implementation: "eo-calibrator@1" },
          { step: "associate", implementation: "track-association@1" },
        ],
      },
      rawPayload: {
        sensorId: "SYN-EO-07",
        trackId: "EO7-20260912-0441",
        referenceObject: "SYN-90001",
        predictedMissDistanceKm: 9.6,
        oneSigmaKm: 2.2,
      },
    },
    {
      id: "obs-radar-03",
      sequence: 3,
      observedAt: "2026-09-12T14:32:41.000Z",
      arrivalOffsetMs: 2_400,
      objectId: "SYN-90002",
      sourceName: "Synthetic radar site BRAVO",
      modality: "RADAR",
      stance: "contradicts",
      summary: "High-quality range/range-rate solution projects a 43.7 ± 1.1 km miss distance.",
      rationale: "The radar solution places the object well outside the keep-out volume and conflicts with both prior tracks.",
      predictedMissDistanceKm: 43.7,
      uncertaintyKm: 1.1,
      reliability: 0.93,
      quality: 0.94,
      relevance: 0.98,
      independence: 1,
      displayPosition: {
        latDeg: 8.48,
        lonDeg: -154.47,
        altitudeKm: 550.4,
      },
      lineage: {
        artifactId: "artifact-radar-03",
        sourceId: "SYN-RADAR-BRAVO",
        publisher: "ARGUS Scenario Lab",
        collectionMethod: "Synthetic range and range-rate track",
        artifactUrl: "/api/feeds/space-threat-demo?artifact=artifact-radar-03",
        sha256: "a764d2fa05df0b8c8aff8b2ac7a5f94f1e0e419409b696cd46e721af3eea426a",
        synthetic: true,
        generatedBy: "argus-space-demo-fixture@1",
        schemaVersion: "argus.observation.v1",
        transforms: [
          { step: "calibrate", implementation: "radar-calibrator@1" },
          { step: "associate", implementation: "track-association@1" },
        ],
      },
      rawPayload: {
        sensorId: "SYN-RADAR-BRAVO",
        trackId: "RB-20260912-8820",
        referenceObject: "SYN-90001",
        predictedMissDistanceKm: 43.7,
        oneSigmaKm: 1.1,
      },
    },
    {
      id: "obs-eo-04",
      sequence: 4,
      observedAt: "2026-09-12T14:33:04.000Z",
      arrivalOffsetMs: 3_600,
      objectId: "SYN-90002",
      sourceName: "Synthetic EO telescope 12",
      modality: "EO/IR",
      stance: "supports",
      summary: "A second optical solution projects a 12.4 ± 2.8 km miss distance.",
      rationale: "The independently tasked optical sensor restores support for a keep-out crossing without resolving the radar conflict.",
      predictedMissDistanceKm: 12.4,
      uncertaintyKm: 2.8,
      reliability: 0.84,
      quality: 0.88,
      relevance: 0.96,
      independence: 0.9,
      displayPosition: {
        latDeg: 8.69,
        lonDeg: -154.16,
        altitudeKm: 550.9,
      },
      lineage: {
        artifactId: "artifact-eo-04",
        sourceId: "SYN-EO-12",
        publisher: "ARGUS Scenario Lab",
        collectionMethod: "Synthetic electro-optical angle track",
        artifactUrl: "/api/feeds/space-threat-demo?artifact=artifact-eo-04",
        sha256: "9bc332060cf3053aa1d6e9fecd69b0094fc4039199ae1610993df919558a35fa",
        synthetic: true,
        generatedBy: "argus-space-demo-fixture@1",
        schemaVersion: "argus.observation.v1",
        transforms: [
          { step: "calibrate", implementation: "eo-calibrator@1" },
          { step: "associate", implementation: "track-association@1" },
        ],
      },
      rawPayload: {
        sensorId: "SYN-EO-12",
        trackId: "EO12-20260912-0197",
        referenceObject: "SYN-90001",
        predictedMissDistanceKm: 12.4,
        oneSigmaKm: 2.8,
      },
    },
  ],
};

const clampProbability = (value: number): number =>
  Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, value));

const toLogOdds = (probability: number): number => {
  const bounded = clampProbability(probability);
  return Math.log(bounded / (1 - bounded));
};

const fromLogOdds = (logOdds: number): number => 1 / (1 + Math.exp(-logOdds));

const stanceDirection = (stance: EvidenceStance): -1 | 0 | 1 => {
  if (stance === "supports") return 1;
  if (stance === "contradicts") return -1;
  return 0;
};

export const classifyConfidence = (confidence: number): ConfidenceBand => {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "elevated";
  if (confidence >= 0.4) return "contested";
  return "low";
};

export const effectiveEvidenceWeight = (observation: SpaceThreatObservation): number =>
  observation.reliability *
  observation.quality *
  observation.relevance *
  observation.independence;

export function validateObservation(observation: SpaceThreatObservation): void {
  const boundedFields = [
    ["reliability", observation.reliability],
    ["quality", observation.quality],
    ["relevance", observation.relevance],
    ["independence", observation.independence],
  ] as const;

  for (const [name, value] of boundedFields) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be between 0 and 1`);
    }
  }

  if (!Number.isFinite(observation.predictedMissDistanceKm) || observation.predictedMissDistanceKm < 0) {
    throw new RangeError("predictedMissDistanceKm must be a non-negative number");
  }

  if (!Number.isFinite(observation.uncertaintyKm) || observation.uncertaintyKm < 0) {
    throw new RangeError("uncertaintyKm must be a non-negative number");
  }
}

export function fuseSpaceThreatScenario(
  throughSequence: number,
  scenario: SpaceThreatScenario = SPACE_THREAT_SCENARIO,
): SpaceThreatAssessment {
  if (!Number.isInteger(throughSequence) || throughSequence < 0 || throughSequence > scenario.observations.length) {
    throw new RangeError(`throughSequence must be an integer from 0 to ${scenario.observations.length}`);
  }

  const observations = [...scenario.observations]
    .filter((observation) => observation.sequence <= throughSequence)
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));

  let confidence = clampProbability(scenario.priorProbability);
  let logOdds = toLogOdds(confidence);
  let supportWeight = 0;
  let contradictionWeight = 0;
  const contributions: ConfidenceContribution[] = [];

  for (const observation of observations) {
    validateObservation(observation);
    const weight = effectiveEvidenceWeight(observation);
    const direction = stanceDirection(observation.stance);
    const delta = direction * FUSION_GAIN * weight;
    const priorConfidence = confidence;

    logOdds += delta;
    confidence = clampProbability(fromLogOdds(logOdds));

    if (direction > 0) supportWeight += weight;
    if (direction < 0) contradictionWeight += weight;

    contributions.push({
      observationId: observation.id,
      stance: observation.stance,
      effectiveWeight: weight,
      logOddsDelta: delta,
      priorConfidence,
      posteriorConfidence: confidence,
      rationale: observation.rationale,
    });
  }

  const totalDirectionalWeight = supportWeight + contradictionWeight;
  const conflictRatio =
    totalDirectionalWeight === 0
      ? 0
      : (2 * Math.min(supportWeight, contradictionWeight)) / totalDirectionalWeight;

  return {
    claimId: scenario.id,
    priorProbability: scenario.priorProbability,
    confidence,
    confidenceBand: classifyConfidence(confidence),
    supportWeight,
    contradictionWeight,
    conflictRatio,
    evaluatedObservationIds: observations.map((observation) => observation.id),
    contributions,
    reasoning: [
      `Prior ${formatPercent(scenario.priorProbability)}; fixed fusion gain ${FUSION_GAIN.toFixed(2)}.`,
      ...contributions.map((contribution) => {
        const sign = contribution.logOddsDelta >= 0 ? "+" : "";
        return `${contribution.observationId}: ${contribution.stance} (${sign}${contribution.logOddsDelta.toFixed(3)} log-odds), ${formatPercent(contribution.priorConfidence)} → ${formatPercent(contribution.posteriorConfidence)}.`;
      }),
      `Conflict index ${formatPercent(conflictRatio)}; contradictory evidence remains visible and is not averaged away.`,
    ],
  };
}

export function findObservationByArtifactId(
  artifactId: string,
  scenario: SpaceThreatScenario = SPACE_THREAT_SCENARIO,
): SpaceThreatObservation | undefined {
  return scenario.observations.find((observation) => observation.lineage.artifactId === artifactId);
}

export function canonicalizeArtifactPayload(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeArtifactPayload(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeArtifactPayload(item)}`);

  return `{${entries.join(",")}}`;
}

export const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

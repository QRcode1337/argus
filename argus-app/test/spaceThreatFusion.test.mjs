import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  SPACE_THREAT_SCENARIO,
  canonicalizeArtifactPayload,
  effectiveEvidenceWeight,
  findObservationByArtifactId,
  fuseSpaceThreatScenario,
  validateObservation,
} from "../src/lib/spaceThreat/demoScenario.ts";

const within = (actual, expected, tolerance = 0.0005) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("synthetic scenario exposes the intended confidence reversal", () => {
  const confidences = SPACE_THREAT_SCENARIO.observations.map((observation) =>
    fuseSpaceThreatScenario(observation.sequence).confidence,
  );

  within(confidences[0], 0.478);
  within(confidences[1], 0.697);
  within(confidences[2], 0.44);
  within(confidences[3], 0.636);
  assert.ok(confidences[2] < confidences[1], "the radar contradiction must lower confidence");
  assert.ok(confidences[3] > confidences[2], "the final independent optical cue must recover confidence");
});

test("contradictory evidence remains explicit after confidence recovers", () => {
  const assessment = fuseSpaceThreatScenario(4);

  assert.equal(assessment.evaluatedObservationIds.length, 4);
  assert.equal(assessment.contributions[2].stance, "contradicts");
  assert.ok(assessment.contributions[2].logOddsDelta < 0);
  assert.ok(assessment.conflictRatio > 0.6);
  assert.match(assessment.reasoning.at(-1), /Contradictory evidence remains visible/i);
});

test("effective weight is the documented product of evidence factors", () => {
  const observation = SPACE_THREAT_SCENARIO.observations[0];
  within(
    effectiveEvidenceWeight(observation),
    observation.reliability * observation.quality * observation.relevance * observation.independence,
    Number.EPSILON,
  );
});

test("artifact lineage resolves and hashes the canonical synthetic payload", () => {
  for (const observation of SPACE_THREAT_SCENARIO.observations) {
    const resolved = findObservationByArtifactId(observation.lineage.artifactId);
    assert.equal(resolved?.id, observation.id);

    const digest = createHash("sha256")
      .update(canonicalizeArtifactPayload(observation.rawPayload))
      .digest("hex");
    assert.equal(digest, observation.lineage.sha256);
    assert.equal(observation.lineage.synthetic, true);
  }
});

test("canonical payload serialization is stable across key order", () => {
  assert.equal(
    canonicalizeArtifactPayload({ z: 2, nested: { beta: 2, alpha: 1 }, a: 1 }),
    canonicalizeArtifactPayload({ a: 1, nested: { alpha: 1, beta: 2 }, z: 2 }),
  );
});

test("invalid evidence bounds and sequence windows are rejected", () => {
  const invalidObservation = {
    ...SPACE_THREAT_SCENARIO.observations[0],
    reliability: 1.1,
  };

  assert.throws(() => validateObservation(invalidObservation), /reliability must be between 0 and 1/);
  assert.throws(() => fuseSpaceThreatScenario(-1), /throughSequence/);
  assert.throws(
    () => fuseSpaceThreatScenario(SPACE_THREAT_SCENARIO.observations.length + 1),
    /throughSequence/,
  );
});

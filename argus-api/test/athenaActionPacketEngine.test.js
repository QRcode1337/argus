const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPacketFromAnomaly,
  buildPacketFromGdeltEvents,
  clampConfidence,
  validateMachineActions,
} = require("../src/services/athena/actionPacketEngine");

test("ATHENA buildPacketFromAnomaly creates approval-gated packet with safe alternatives", () => {
  const packet = buildPacketFromAnomaly({
    type: "seismic",
    chaosScore: 0.91,
    lat: 35.68,
    lon: 139.69,
    severity: "critical",
    timestamp: "2026-06-05T10:00:00.000Z",
  });

  assert.equal(packet.type, "argus.athena.action_packet");
  assert.equal(packet.priority, "critical");
  assert.equal(packet.status, "proposed");
  assert.equal(packet.requiresApproval, true);
  assert.ok(packet.id.length > 0);
  assert.ok(packet.proposedAction.label.length > 0);
  assert.ok(packet.explanation.length >= 2);
  assert.ok(packet.safeAlternatives.length >= 3);
  assert.ok(packet.machineActions.some((action) => action.action === "enable_layers"));
  assert.ok(packet.machineActions.some((action) => action.action === "fly_to"));
  assert.ok(packet.confidence >= 0.8 && packet.confidence <= 1);
});

test("ATHENA buildPacketFromGdeltEvents elevates material conflict clusters", () => {
  const packet = buildPacketFromGdeltEvents([
    {
      id: "g1",
      dateAdded: "20260605100000",
      actor1Name: "ACTOR A",
      actor1Country: "AA",
      actor2Name: "ACTOR B",
      actor2Country: "BB",
      eventCode: "190",
      eventBaseCode: "190",
      eventRootCode: "19",
      quadClass: 4,
      goldsteinScale: -8,
      numMentions: 12,
      numSources: 5,
      avgTone: -6.2,
      actionGeoName: "Black Sea",
      actionGeoCountry: "UP",
      latitude: 44.4,
      longitude: 34.1,
      sourceUrl: "https://example.test/g1",
    },
  ]);

  assert.equal(packet.priority, "high");
  assert.equal(packet.region.label, "Black Sea");
  assert.equal(packet.trigger.source, "gdelt");
  assert.ok(packet.explanation.some((line) => line.includes("Goldstein")));
  assert.ok(packet.safeAlternatives.some((alt) => /Passive|Analyst|Narrow/i.test(alt.label)));
  assert.ok(packet.machineActions.some((action) => action.action === "enable_layers"));
});

test("ATHENA validateMachineActions rejects non-allowlisted action names", () => {
  assert.throws(
    () => validateMachineActions([{ action: "send_email", params: {} }]),
    /not allowlisted/,
  );

  assert.throws(
    () => validateMachineActions([{ action: "feel_to", params: { lat: 1, lon: 2 } }]),
    /not allowlisted/,
  );
});

test("ATHENA clampConfidence keeps values in range", () => {
  assert.equal(clampConfidence(-0.5), 0);
  assert.equal(clampConfidence(1.5), 1);
  assert.equal(clampConfidence(0.42), 0.42);
  assert.equal(clampConfidence(Number.NaN), 0);
});

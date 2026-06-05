const test = require("node:test");
const assert = require("node:assert/strict");

const { maybeGenerateAthenaForAnomaly, normalizeAnomalyIntake } = require("../src/services/athena/phantomBridge");

function createHarness() {
  const inserted = [];
  const emitted = [];
  return {
    inserted,
    emitted,
    repository: {
      async insertPacket(packet) {
        inserted.push(packet);
        return packet;
      },
    },
    io: {
      emit(event, payload) {
        emitted.push({ event, payload });
      },
    },
  };
}

test("ATHENA Phantom bridge emits packet for high severity anomaly", async () => {
  const harness = createHarness();

  const packet = await maybeGenerateAthenaForAnomaly({
    event: {
      type: "seismic",
      chaosScore: 0.82,
      lat: 35.68,
      lon: 139.69,
      severity: "high",
      timestamp: "2026-06-05T10:00:00.000Z",
    },
    repository: harness.repository,
    io: harness.io,
  });

  assert.ok(packet);
  assert.equal(harness.inserted.length, 1);
  assert.equal(harness.emitted.length, 1);
  assert.equal(harness.emitted[0].event, "athena_action_packet");
  assert.equal(harness.emitted[0].payload.id, packet.id);
});

test("ATHENA Phantom bridge ignores low-signal anomaly", async () => {
  const harness = createHarness();

  const packet = await maybeGenerateAthenaForAnomaly({
    event: {
      type: "flight",
      chaosScore: 0.2,
      lat: 40.64,
      lon: -73.77,
      severity: "low",
      timestamp: "2026-06-05T10:00:00.000Z",
    },
    repository: harness.repository,
    io: harness.io,
  });

  assert.equal(packet, null);
  assert.equal(harness.inserted.length, 0);
  assert.equal(harness.emitted.length, 0);
});

test("ATHENA Phantom bridge does not throw if persistence fails", async () => {
  const emitted = [];
  const packet = await maybeGenerateAthenaForAnomaly({
    event: {
      type: "weather",
      chaosScore: 0.95,
      lat: 25.2,
      lon: 55.3,
      severity: "critical",
      timestamp: "2026-06-05T10:00:00.000Z",
    },
    repository: {
      async insertPacket() {
        throw new Error("db unavailable");
      },
    },
    io: {
      emit(event, payload) {
        emitted.push({ event, payload });
      },
    },
    logger: { error() {} },
  });

  assert.equal(packet, null);
  assert.equal(emitted.length, 0);
});

test("ATHENA normalizeAnomalyIntake returns a safe event and payload JSON", () => {
  const normalized = normalizeAnomalyIntake({
    type: "seismic",
    chaosScore: 0.81,
    lat: 35.68,
    lon: 139.69,
    severity: "high",
  });

  assert.deepEqual(normalized.event, {
    type: "seismic",
    chaosScore: 0.81,
    lat: 35.68,
    lon: 139.69,
    severity: "high",
    timestamp: normalized.event.timestamp,
  });
  assert.equal(normalized.payloadJson, "{}");
  assert.ok(Date.parse(normalized.event.timestamp));
});

test("ATHENA normalizeAnomalyIntake rejects invalid anomaly payloads", () => {
  assert.throws(
    () => normalizeAnomalyIntake({ type: "seismic", chaosScore: "bad", lat: 35.68, lon: 139.69, severity: "high" }),
    /chaosScore/,
  );
  assert.throws(
    () => normalizeAnomalyIntake({ type: "seismic", chaosScore: 0.8, lat: 95, lon: 139.69, severity: "high" }),
    /lat/,
  );
  assert.throws(
    () => normalizeAnomalyIntake({ type: "seismic", chaosScore: 0.8, lat: 35.68, lon: 139.69, severity: "urgent" }),
    /severity/,
  );
});

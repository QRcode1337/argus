const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { createAthenaRouter } = require("../src/routes/athena");

function createMemoryRepository(initialPackets = []) {
  const packets = [...initialPackets];
  return {
    packets,
    async listPackets({ limit = 20, status } = {}) {
      return packets
        .filter((packet) => (status ? packet.status === status : true))
        .slice(0, limit);
    },
    async insertPacket(packet) {
      packets.unshift(packet);
      return packet;
    },
    async updatePacketDecision(id, decision) {
      const packet = packets.find((candidate) => candidate.id === id);
      if (!packet) return null;
      Object.assign(packet, {
        status: decision.status,
        decision,
        updatedAt: decision.decidedAt,
      });
      return packet;
    },
  };
}

async function createTestServer(repository, io = null) {
  const app = express();
  app.use(express.json());
  if (io) app.set("io", io);
  app.use("/api/athena", createAthenaRouter({ repository }));

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, (error) => {
      if (error) reject(error);
      else resolve(listener);
    });
  });

  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/athena`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

test("ATHENA GET /action-packets returns empty packet list", async () => {
  const repository = createMemoryRepository();
  const server = await createTestServer(repository);

  try {
    const response = await fetch(`${server.baseUrl}/action-packets`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { packets: [] });
  } finally {
    await server.close();
  }
});

test("ATHENA POST /action-packets/generate stores packet and emits socket event", async () => {
  const repository = createMemoryRepository();
  const emitted = [];
  const io = { emit: (event, payload) => emitted.push({ event, payload }) };
  const server = await createTestServer(repository, io);

  try {
    const response = await fetch(`${server.baseUrl}/action-packets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "phantom",
        event: {
          type: "seismic",
          chaosScore: 0.91,
          lat: 35.68,
          lon: 139.69,
          severity: "critical",
          timestamp: "2026-06-05T10:00:00.000Z",
        },
      }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.packet.type, "argus.athena.action_packet");
    assert.equal(repository.packets.length, 1);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].event, "athena_action_packet");
    assert.equal(emitted[0].payload.id, body.packet.id);
  } finally {
    await server.close();
  }
});

test("ATHENA PATCH /action-packets/:id/decision updates packet status", async () => {
  const repository = createMemoryRepository();
  const server = await createTestServer(repository);

  try {
    const generateResponse = await fetch(`${server.baseUrl}/action-packets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "gdelt",
        events: [{
          id: "g1",
          dateAdded: "20260605100000",
          quadClass: 4,
          goldsteinScale: -8,
          numMentions: 12,
          numSources: 5,
          avgTone: -6.2,
          actionGeoName: "Black Sea",
          actionGeoCountry: "UP",
          latitude: 44.4,
          longitude: 34.1,
        }],
      }),
    });
    const { packet } = await generateResponse.json();

    const response = await fetch(`${server.baseUrl}/action-packets/${packet.id}/decision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", note: "Proceed with local posture change." }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.packet.status, "approved");
    assert.equal(body.packet.decision.note, "Proceed with local posture change.");
  } finally {
    await server.close();
  }
});

test("ATHENA PATCH /decision rejects invalid decision status", async () => {
  const repository = createMemoryRepository();
  const server = await createTestServer(repository);

  try {
    const response = await fetch(`${server.baseUrl}/action-packets/missing/decision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "autopilot" }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /Invalid ATHENA decision/);
  } finally {
    await server.close();
  }
});

const express = require("express");

const defaultRepository = require("../services/athena/actionPacketRepository");
const {
  buildPacketFromAnomaly,
  buildPacketFromGdeltEvents,
} = require("../services/athena/actionPacketEngine");

const VALID_DECISIONS = new Set(["approved", "dismissed", "simulated"]);

function createPacketFromBody(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("ATHENA request body is required");
    error.status = 400;
    throw error;
  }

  if (body.source === "phantom") {
    return buildPacketFromAnomaly(body.event);
  }

  if (body.source === "gdelt") {
    return buildPacketFromGdeltEvents(body.events);
  }

  const error = new Error("Unsupported ATHENA source");
  error.status = 400;
  throw error;
}

function getIo(req) {
  try {
    return req.app.get("io");
  } catch {
    return null;
  }
}

function createAthenaRouter(options = {}) {
  const repository = options.repository || defaultRepository;
  const router = express.Router();

  router.get("/action-packets", async (req, res, next) => {
    try {
      const packets = await repository.listPackets({
        limit: req.query.limit,
        status: req.query.status,
      });
      res.json({ packets });
    } catch (error) {
      next(error);
    }
  });

  router.post("/action-packets/generate", async (req, res, next) => {
    try {
      const packet = createPacketFromBody(req.body);
      await repository.insertPacket(packet);

      const io = getIo(req);
      if (io && typeof io.emit === "function") {
        io.emit("athena_action_packet", packet);
      }

      res.status(201).json({ packet });
    } catch (error) {
      if (error.status) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch("/action-packets/:id/decision", async (req, res, next) => {
    try {
      const status = req.body?.status;
      if (!VALID_DECISIONS.has(status)) {
        res.status(400).json({ error: "Invalid ATHENA decision status" });
        return;
      }

      const decision = {
        status,
        note: typeof req.body.note === "string" ? req.body.note : "",
        decidedAt: new Date().toISOString(),
      };

      const packet = await repository.updatePacketDecision(req.params.id, decision);
      if (!packet) {
        res.status(404).json({ error: "ATHENA packet not found" });
        return;
      }

      res.json({ packet });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createAthenaRouter();
module.exports.createAthenaRouter = createAthenaRouter;
module.exports.createPacketFromBody = createPacketFromBody;
module.exports.VALID_DECISIONS = VALID_DECISIONS;

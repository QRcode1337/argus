const defaultRepository = require("./actionPacketRepository");
const { buildPacketFromAnomaly } = require("./actionPacketEngine");

const VALID_ANOMALY_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function finiteNumber(value, name) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    const error = new Error(`Invalid anomaly ${name}`);
    error.status = 400;
    throw error;
  }
  return next;
}

function normalizeAnomalyIntake(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Anomaly payload is required");
    error.status = 400;
    throw error;
  }

  const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : null;
  if (!type) {
    const error = new Error("Invalid anomaly type");
    error.status = 400;
    throw error;
  }

  const chaosScore = finiteNumber(body.chaosScore, "chaosScore");
  if (chaosScore < 0 || chaosScore > 1) {
    const error = new Error("Invalid anomaly chaosScore");
    error.status = 400;
    throw error;
  }

  const lat = finiteNumber(body.lat, "lat");
  if (lat < -90 || lat > 90) {
    const error = new Error("Invalid anomaly lat");
    error.status = 400;
    throw error;
  }

  const lon = finiteNumber(body.lon, "lon");
  if (lon < -180 || lon > 180) {
    const error = new Error("Invalid anomaly lon");
    error.status = 400;
    throw error;
  }

  const severity = String(body.severity || "").toLowerCase();
  if (!VALID_ANOMALY_SEVERITIES.has(severity)) {
    const error = new Error("Invalid anomaly severity");
    error.status = 400;
    throw error;
  }

  const sourcePayload = body.payload === undefined ? {} : body.payload;
  const payloadJson = JSON.stringify(sourcePayload);
  if (payloadJson === undefined) {
    const error = new Error("Invalid anomaly payload");
    error.status = 400;
    throw error;
  }

  return {
    event: {
      type,
      chaosScore,
      lat,
      lon,
      severity,
      timestamp: new Date().toISOString(),
    },
    payloadJson,
  };
}

function isHighSignalAnomaly(event) {
  if (!event || typeof event !== "object") return false;
  const severity = String(event.severity || "").toLowerCase();
  const chaosScore = Number(event.chaosScore || 0);
  return severity === "high" || severity === "critical" || chaosScore >= 0.75;
}

async function maybeGenerateAthenaForAnomaly({
  event,
  repository = defaultRepository,
  io = null,
  logger = console,
} = {}) {
  if (!isHighSignalAnomaly(event)) return null;

  try {
    const packet = buildPacketFromAnomaly(event);
    await repository.insertPacket(packet);

    if (io && typeof io.emit === "function") {
      io.emit("athena_action_packet", packet);
    }

    return packet;
  } catch (error) {
    logger.error?.("ATHENA packet generation failed:", error);
    return null;
  }
}

module.exports = {
  isHighSignalAnomaly,
  maybeGenerateAthenaForAnomaly,
  normalizeAnomalyIntake,
};

const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Sentry = require("@sentry/node");

const analyticsRoutes = require("./routes/analytics");
const athenaRoutes = require("./routes/athena");
const feedsRoutes = require("./routes/feeds");
const iotRoutes = require("./routes/iot");
const recordRoutes = require("./routes/record");
const playbackRoutes = require("./routes/playback");

dotenv.config();

const glitchtipDsn = process.env.GLITCHTIP_API_DSN || process.env.GLITCHTIP_DSN;
if (glitchtipDsn) {
  Sentry.init({
    dsn: glitchtipDsn,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

function getCorsOrigins(rawValue = process.env.CORS_ORIGIN) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createServer(options = {}) {
  const corsOrigins = getCorsOrigins(options.corsOrigin);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : true,
  });

  app.set("io", io);
  app.disable("x-powered-by");
  // Flight batches carry up to ARGUS_CONFIG.limits.maxFlights (7000) records —
  // ~2MB of JSON. The 100kb express default silently 413d every one of them.
  app.use(express.json({ limit: "16mb" }));
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : true,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "argus-api" });
  });

  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/athena", athenaRoutes);
  app.use("/api/feeds", feedsRoutes);
  app.use("/api/iot", iotRoutes);
  app.use("/api/record", recordRoutes);
  app.use("/api/playback", playbackRoutes);

  app.use((err, _req, res, _next) => {
    if (glitchtipDsn) {
      Sentry.captureException(err);
    }
    res.status(err.status || 500).json({ error: "Internal server error" });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return { app, server, io, corsOrigins };
}

module.exports = {
  createServer,
  getCorsOrigins,
};

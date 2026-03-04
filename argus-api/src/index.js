const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const Sentry = require("@sentry/node");

const analyticsRoutes = require("./routes/analytics");
const feedsRoutes = require("./routes/feeds");
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

const app = express();
const port = Number(process.env.PORT || 3001);
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim());

app.disable("x-powered-by");
app.use(express.json());
app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
  }),
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "argus-api" });
});

app.use("/api/analytics", analyticsRoutes);
app.use("/api/feeds", feedsRoutes);
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

app.listen(port, () => {
  console.log(`argus-api listening on port ${port}`);
});

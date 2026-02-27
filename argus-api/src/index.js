const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

const analyticsRoutes = require("./routes/analytics");
const feedsRoutes = require("./routes/feeds");

dotenv.config();

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

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`argus-api listening on port ${port}`);
});

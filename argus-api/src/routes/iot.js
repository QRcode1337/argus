const express = require("express");
const pool = require("../db");

const router = express.Router();

function rowToGeoJSON(location) {
  try {
    const parsed = JSON.parse(location);
    return parsed ?? null;
  } catch {
    return null;
  }
}

router.get("/devices", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.device_id,
             d.name,
             d.description,
             ST_AsGeoJSON(d.location) AS location,
             d.meta,
             d.last_seen,
             d.created_at,
             lr.metric   AS last_metric,
             lr.value    AS last_value,
             lr.unit     AS last_unit,
             lr."time"   AS last_reading_time
      FROM iot_devices d
      LEFT JOIN LATERAL (
        SELECT r.metric, r.value, r.unit, r."time"
        FROM iot_readings r
        WHERE r.device_id = d.device_id
        ORDER BY r."time" DESC
        LIMIT 1
      ) lr ON true
      ORDER BY d.last_seen DESC
    `);
    res.json({
      count: rows.length,
      devices: rows.map((r) => ({
        device_id: r.device_id,
        name: r.name,
        description: r.description,
        location: rowToGeoJSON(r.location),
        meta: r.meta,
        last_seen: r.last_seen,
        created_at: r.created_at,
        last_reading: r.last_metric
          ? {
              metric: r.last_metric,
              value: r.last_value,
              unit: r.last_unit,
              time: r.last_reading_time,
            }
          : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to list IoT devices" });
  }
});

router.get("/readings", async (req, res) => {
  const {
    device,
    metric,
    from,
    to,
    limit = "500",
  } = req.query;

  if (!device) {
    return res.status(400).json({ error: "Missing required query param: device" });
  }

  const clauses = ["r.device_id = $1"];
  const params = [device];
  let idx = 2;
  if (metric) {
    clauses.push(`r.metric = $${idx++}`);
    params.push(metric);
  }
  if (from) {
    clauses.push(`r."time" >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    clauses.push(`r."time" <= $${idx++}`);
    params.push(to);
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT r."time", r.metric, r.value, r.unit, r.meta
        FROM iot_readings r
        WHERE ${clauses.join(" AND ")}
        ORDER BY r."time" DESC
        LIMIT $${idx}
      `,
      [...params, Number(limit) || 500],
    );
    res.json({
      count: rows.length,
      readings: rows.map((r) => ({
        time: r.time,
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        meta: r.meta,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to query IoT readings" });
  }
});

router.get("/metrics", async (req, res) => {
  const { device } = req.query;
  if (!device) {
    return res.status(400).json({ error: "Missing required query param: device" });
  }
  try {
    const { rows } = await pool.query(
      `
        SELECT r.metric, r.unit, COUNT(*) AS samples, MAX(r."time") AS last_time
        FROM iot_readings r
        WHERE r.device_id = $1
        GROUP BY r.metric, r.unit
        ORDER BY last_time DESC
      `,
      [device],
    );
    res.json({ device, metrics: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to list device metrics" });
  }
});

module.exports = router;
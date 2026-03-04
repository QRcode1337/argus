const { Router } = require("express");
const pool = require("../db");

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW = 30;

/**
 * Parse and validate the shared query parameters for playback routes.
 * Returns { ts, window } or sends a 400 and returns null.
 */
function parseTimeParams(req, res) {
  const { ts, window } = req.query;

  if (!ts) {
    res.status(400).json({ error: "ts query parameter is required (ISO 8601 timestamp)" });
    return null;
  }

  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    res.status(400).json({ error: "ts must be a valid ISO 8601 timestamp" });
    return null;
  }

  const windowSec = window != null ? Number(window) : DEFAULT_WINDOW;
  if (Number.isNaN(windowSec) || windowSec < 0) {
    res.status(400).json({ error: "window must be a non-negative number of seconds" });
    return null;
  }

  return { ts: parsed.toISOString(), window: windowSec };
}

/**
 * Time-window WHERE clause used by every playback query.
 * Expects $1 = ts (timestamptz) and $2 = window (text, seconds).
 */
const TIME_WINDOW_CLAUSE = `
  WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                AND $1::timestamptz + ($2 || ' seconds')::interval`;

// ---------------------------------------------------------------------------
// GET /flights  ->  recorded_flights (deduplicated by icao24)
// ---------------------------------------------------------------------------
router.get("/flights", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (icao24)
        icao24        AS id,
        callsign,
        lon           AS longitude,
        lat           AS latitude,
        alt_m         AS "altitudeMeters",
        velocity,
        heading       AS "trueTrack",
        vertical_rate AS "verticalRate",
        on_ground     AS "onGround",
        origin_country AS "originCountry",
        squawk
      FROM recorded_flights
      ${TIME_WINDOW_CLAUSE}
      ORDER BY icao24, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ flights: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /military  ->  recorded_military (deduplicated by icao24)
// ---------------------------------------------------------------------------
router.get("/military", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (icao24)
        icao24        AS id,
        callsign,
        lon           AS longitude,
        lat           AS latitude,
        alt_m         AS "altitudeMeters",
        velocity,
        heading       AS "trueTrack",
        aircraft_type AS type
      FROM recorded_military
      ${TIME_WINDOW_CLAUSE}
      ORDER BY icao24, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ flights: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /satellites  ->  recorded_satellites (deduplicated by norad_id)
// ---------------------------------------------------------------------------
router.get("/satellites", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (norad_id)
        norad_id  AS id,
        name,
        lon       AS longitude,
        lat       AS latitude,
        alt_km    AS "altitudeKm",
        tle_line1 AS tle1,
        tle_line2 AS tle2
      FROM recorded_satellites
      ${TIME_WINDOW_CLAUSE}
      ORDER BY norad_id, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ satellites: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /quakes  ->  recorded_quakes (deduplicated by event_id)
// ---------------------------------------------------------------------------
router.get("/quakes", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (event_id)
        event_id  AS id,
        lon       AS longitude,
        lat       AS latitude,
        depth_km  AS "depthKm",
        magnitude,
        place,
        ts        AS timestamp
      FROM recorded_quakes
      ${TIME_WINDOW_CLAUSE}
      ORDER BY event_id, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ quakes: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /outages  ->  recorded_outages (deduplicated by location + cause)
// ---------------------------------------------------------------------------
router.get("/outages", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (location, cause)
        location,
        cause,
        outage_type AS type,
        start_date  AS "startDate",
        end_date    AS "endDate",
        asn_name    AS "asnName"
      FROM recorded_outages
      ${TIME_WINDOW_CLAUSE}
      ORDER BY location, cause, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ outages: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /threats  ->  recorded_threats (deduplicated by pulse_id)
// ---------------------------------------------------------------------------
router.get("/threats", async (req, res, next) => {
  try {
    const params = parseTimeParams(req, res);
    if (!params) return;

    const sql = `
      SELECT DISTINCT ON (pulse_id)
        pulse_id          AS id,
        name,
        adversary,
        targeted_country  AS "targetedCountry",
        lon               AS longitude,
        lat               AS latitude
      FROM recorded_threats
      ${TIME_WINDOW_CLAUSE}
      ORDER BY pulse_id, ts DESC`;

    const { rows } = await pool.query(sql, [params.ts, String(params.window)]);
    res.json({ threats: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /range  ->  earliest & latest ts across the most active tables
// ---------------------------------------------------------------------------
router.get("/range", async (_req, res, next) => {
  try {
    const sql = `
      SELECT
        LEAST(f.earliest, m.earliest)    AS earliest,
        GREATEST(f.latest, m.latest)     AS latest
      FROM
        (SELECT MIN(ts) AS earliest, MAX(ts) AS latest FROM recorded_flights)  f,
        (SELECT MIN(ts) AS earliest, MAX(ts) AS latest FROM recorded_military) m`;

    const { rows } = await pool.query(sql);
    const { earliest, latest } = rows[0] || {};

    res.json({
      earliest: earliest ? earliest.toISOString() : null,
      latest: latest ? latest.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

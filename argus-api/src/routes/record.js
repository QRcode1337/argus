const { Router } = require("express");
const pool = require("../db");

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a parameterized VALUES clause for a batch insert.
 *
 * `mapRow` receives a row and the current parameter index and must return
 * { placeholders: string[], values: any[] }.  Placeholders may be plain "$N"
 * references or expressions such as "ST_SetSRID(ST_MakePoint($3, $4), 4326)".
 */
function buildBatch(rows, mapRow) {
  const allValues = [];
  const tuples = [];
  let idx = 1;

  for (const row of rows) {
    const { placeholders, values } = mapRow(row, idx);
    tuples.push(`(${placeholders.join(", ")})`);
    allValues.push(...values);
    idx += values.length;
  }

  return { tuples: tuples.join(", "), values: allValues };
}

/**
 * Return a PostGIS point expression when lon/lat are present, otherwise NULL.
 * Pushes lon and lat values and returns the placeholder expression with the
 * number of parameter slots consumed.
 */
function geomExpr(lon, lat, idx) {
  if (lon != null && lat != null) {
    return {
      expr: `ST_SetSRID(ST_MakePoint($${idx}, $${idx + 1}), 4326)`,
      values: [lon, lat],
      consumed: 2,
    };
  }
  return { expr: "NULL", values: [], consumed: 0 };
}

// ---------------------------------------------------------------------------
// POST /flights  ->  recorded_flights
// ---------------------------------------------------------------------------
router.post("/flights", async (req, res, next) => {
  try {
    const rows = req.body?.flights;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "flights array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const vals = [
        ts,
        r.id,
        r.callsign ?? null,
        r.longitude ?? null,
        r.latitude ?? null,
        r.altitudeMeters ?? null,
        r.velocity ?? null,
        r.trueTrack ?? null,
        r.verticalRate ?? null,
        r.onGround ?? false,
        r.originCountry ?? null,
        r.squawk ?? null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      const g = geomExpr(r.longitude, r.latitude, idx + vals.length);
      ph.push(g.expr);
      return { placeholders: ph, values: [...vals, ...g.values] };
    });

    const sql = `
      INSERT INTO recorded_flights
        (ts, icao24, callsign, lon, lat, alt_m, velocity, heading,
         vertical_rate, on_ground, origin_country, squawk, geom)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /military  ->  recorded_military
// ---------------------------------------------------------------------------
router.post("/military", async (req, res, next) => {
  try {
    const rows = req.body?.flights;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "flights array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const vals = [
        ts,
        r.id,
        r.callsign ?? null,
        r.longitude ?? null,
        r.latitude ?? null,
        r.altitudeMeters ?? null,
        r.velocity ?? null,
        r.trueTrack ?? null,
        r.type ?? null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      const g = geomExpr(r.longitude, r.latitude, idx + vals.length);
      ph.push(g.expr);
      return { placeholders: ph, values: [...vals, ...g.values] };
    });

    const sql = `
      INSERT INTO recorded_military
        (ts, icao24, callsign, lon, lat, alt_m, velocity, heading,
         aircraft_type, geom)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /satellites  ->  recorded_satellites
// ---------------------------------------------------------------------------
router.post("/satellites", async (req, res, next) => {
  try {
    const rows = req.body?.satellites;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "satellites array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const vals = [
        ts,
        r.id,
        r.name ?? null,
        r.longitude ?? null,
        r.latitude ?? null,
        r.altitudeKm ?? null,
        r.tle1 ?? null,
        r.tle2 ?? null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      const g = geomExpr(r.longitude, r.latitude, idx + vals.length);
      ph.push(g.expr);
      return { placeholders: ph, values: [...vals, ...g.values] };
    });

    const sql = `
      INSERT INTO recorded_satellites
        (ts, norad_id, name, lon, lat, alt_km, tle_line1, tle_line2, geom)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /quakes  ->  recorded_quakes
// ---------------------------------------------------------------------------
router.post("/quakes", async (req, res, next) => {
  try {
    const rows = req.body?.quakes;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "quakes array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const vals = [
        ts,
        r.id,
        r.longitude ?? null,
        r.latitude ?? null,
        r.depthKm ?? null,
        r.magnitude ?? null,
        r.place ?? null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      const g = geomExpr(r.longitude, r.latitude, idx + vals.length);
      ph.push(g.expr);
      return { placeholders: ph, values: [...vals, ...g.values] };
    });

    const sql = `
      INSERT INTO recorded_quakes
        (ts, event_id, lon, lat, depth_km, magnitude, place, geom)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /outages  ->  recorded_outages
// ---------------------------------------------------------------------------
router.post("/outages", async (req, res, next) => {
  try {
    const rows = req.body?.outages;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "outages array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const { location, cause, type, startDate, endDate, asnName, ...rest } = r;
      const vals = [
        ts,
        location ?? null,
        cause ?? null,
        type ?? null,
        startDate ?? null,
        endDate ?? null,
        asnName ?? null,
        Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      return { placeholders: ph, values: vals };
    });

    const sql = `
      INSERT INTO recorded_outages
        (ts, location, cause, outage_type, start_date, end_date, asn_name, raw)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /threats  ->  recorded_threats
// ---------------------------------------------------------------------------
router.post("/threats", async (req, res, next) => {
  try {
    const rows = req.body?.threats;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "threats array required" });
    }

    const { tuples, values } = buildBatch(rows, (r, idx) => {
      const ts = new Date().toISOString();
      const {
        id,
        name,
        adversary,
        targetedCountry,
        longitude,
        latitude,
        ...rest
      } = r;
      const vals = [
        ts,
        id,
        name ?? null,
        adversary ?? null,
        targetedCountry ?? null,
        longitude ?? null,
        latitude ?? null,
        Object.keys(rest).length > 0 ? JSON.stringify(rest) : null,
      ];
      const ph = vals.map((_, i) => `$${idx + i}`);
      const g = geomExpr(longitude, latitude, idx + vals.length);
      ph.push(g.expr);
      return { placeholders: ph, values: [...vals, ...g.values] };
    });

    const sql = `
      INSERT INTO recorded_threats
        (ts, pulse_id, name, adversary, targeted_country, lon, lat, raw, geom)
      VALUES ${tuples}
      ON CONFLICT DO NOTHING`;

    const result = await pool.query(sql, values);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

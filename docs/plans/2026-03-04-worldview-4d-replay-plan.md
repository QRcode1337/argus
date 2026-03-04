# WorldView 4D Replay System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DVR-style continuous recording of all OSINT feeds to TimescaleDB and a timeline scrubber for 4D playback on the CesiumJS globe.

**Architecture:** Replace the `postgis/postgis:16-3.4` Docker image with `timescale/timescaledb-ha:pg16-latest` (includes PostGIS + TimescaleDB). Add hypertables for each feed with 7-day retention. Backend gets `/api/record/*` and `/api/playback/*` routes. Frontend adds playback state to Zustand, adapts layer classes to query playback API when in playback mode, and renders a timeline scrubber component.

**Tech Stack:** TimescaleDB (PostgreSQL extension), Express.js, CesiumJS, React 19, Zustand, Next.js 16

**Storage:** `/mnt/volume-nyc3-01` (DigitalOcean block storage for PostGIS data)

---

## Task 1: Docker + Database Schema (TimescaleDB Migration)

**Files:**
- Modify: `docker-compose.yml:78-95` (postgis service)
- Modify: `infra/db/init.sql` (add TimescaleDB extension + hypertables)

**Step 1: Update docker-compose.yml postgis service**

In `docker-compose.yml`, replace the postgis service block (lines 78-95):

```yaml
  postgis:
    image: timescale/timescaledb-ha:pg16-latest
    container_name: argus_postgis
    environment:
      POSTGRES_DB: argus
      POSTGRES_USER: argus
      POSTGRES_PASSWORD: argus_dev
    volumes:
      - /mnt/volume-nyc3-01/pgdata:/home/postgres/pgdata
      - ./infra/db/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U argus -d argus"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - argus_network
    restart: unless-stopped
```

Also remove the `volumes:` section at the bottom that declares `postgis_data:` (line 130-131), since we're using a host mount now.

**Step 2: Rewrite infra/db/init.sql**

Replace the entire file with this schema. Keep the existing tables (weather_layers, flight_routes, analytics_sessions) and add TimescaleDB + hypertables:

```sql
-- Argus PostGIS + TimescaleDB Schema
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ----------------------------------------------------------------
-- Existing tables (unchanged)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_layers (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120)  NOT NULL,
    variable      VARCHAR(50)   NOT NULL,
    level         VARCHAR(80),
    valid_time    TIMESTAMPTZ   NOT NULL,
    forecast_hour SMALLINT      DEFAULT 0,
    run_time      TIMESTAMPTZ   NOT NULL,
    bbox          GEOMETRY(POLYGON, 4326),
    cog_path      VARCHAR(500)  NOT NULL,
    tile_url      VARCHAR(500),
    file_size_mb  NUMERIC(8,2),
    created_at    TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wl_valid_time  ON weather_layers (valid_time DESC);
CREATE INDEX IF NOT EXISTS idx_wl_variable    ON weather_layers (variable);
CREATE INDEX IF NOT EXISTS idx_wl_run_time    ON weather_layers (run_time DESC);
CREATE INDEX IF NOT EXISTS idx_wl_bbox        ON weather_layers USING GIST (bbox);

CREATE TABLE IF NOT EXISTS flight_routes (
    id          SERIAL PRIMARY KEY,
    icao24      VARCHAR(10)   NOT NULL,
    callsign    VARCHAR(20),
    origin      VARCHAR(6),
    destination VARCHAR(6),
    departed_at TIMESTAMPTZ,
    arrived_at  TIMESTAMPTZ,
    path        GEOMETRY(LINESTRING, 4326),
    altitude_m  NUMERIC(8,1)[],
    source      VARCHAR(40)   DEFAULT 'opensky',
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fr_icao24      ON flight_routes (icao24);
CREATE INDEX IF NOT EXISTS idx_fr_departed_at ON flight_routes (departed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fr_path        ON flight_routes USING GIST (path);

CREATE TABLE IF NOT EXISTS analytics_sessions (
    id            SERIAL PRIMARY KEY,
    started_at    TIMESTAMPTZ   DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    layers_viewed TEXT[]        DEFAULT '{}'
);

-- ----------------------------------------------------------------
-- DVR Recording Hypertables
-- ----------------------------------------------------------------

-- Flights (OpenSky commercial)
CREATE TABLE IF NOT EXISTS recorded_flights (
    ts          TIMESTAMPTZ NOT NULL,
    icao24      TEXT NOT NULL,
    callsign    TEXT,
    lon         DOUBLE PRECISION,
    lat         DOUBLE PRECISION,
    alt_m       DOUBLE PRECISION,
    velocity    DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    vertical_rate DOUBLE PRECISION,
    on_ground   BOOLEAN DEFAULT FALSE,
    is_military BOOLEAN DEFAULT FALSE,
    origin_country TEXT,
    squawk      TEXT,
    nacp        SMALLINT,
    geom        GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_flights', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_flights', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rf_ts_icao ON recorded_flights (ts, icao24);
CREATE INDEX IF NOT EXISTS idx_rf_geom ON recorded_flights USING GIST (geom);

-- Military flights (ADS-B)
CREATE TABLE IF NOT EXISTS recorded_military (
    ts          TIMESTAMPTZ NOT NULL,
    icao24      TEXT NOT NULL,
    callsign    TEXT,
    lon         DOUBLE PRECISION,
    lat         DOUBLE PRECISION,
    alt_m       DOUBLE PRECISION,
    velocity    DOUBLE PRECISION,
    heading     DOUBLE PRECISION,
    aircraft_type TEXT,
    geom        GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_military', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_military', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rm_ts_icao ON recorded_military (ts, icao24);
CREATE INDEX IF NOT EXISTS idx_rm_geom ON recorded_military USING GIST (geom);

-- Satellites (CelesTrak TLE)
CREATE TABLE IF NOT EXISTS recorded_satellites (
    ts          TIMESTAMPTZ NOT NULL,
    norad_id    TEXT NOT NULL,
    name        TEXT,
    lon         DOUBLE PRECISION,
    lat         DOUBLE PRECISION,
    alt_km      DOUBLE PRECISION,
    tle_line1   TEXT,
    tle_line2   TEXT,
    geom        GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_satellites', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_satellites', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rs_ts_norad ON recorded_satellites (ts, norad_id);
CREATE INDEX IF NOT EXISTS idx_rs_geom ON recorded_satellites USING GIST (geom);

-- Earthquakes (USGS)
CREATE TABLE IF NOT EXISTS recorded_quakes (
    ts          TIMESTAMPTZ NOT NULL,
    event_id    TEXT NOT NULL,
    lon         DOUBLE PRECISION,
    lat         DOUBLE PRECISION,
    depth_km    DOUBLE PRECISION,
    magnitude   DOUBLE PRECISION,
    place       TEXT,
    geom        GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_quakes', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_quakes', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rq_ts_event ON recorded_quakes (ts, event_id);

-- Internet Outages (Cloudflare Radar)
CREATE TABLE IF NOT EXISTS recorded_outages (
    ts          TIMESTAMPTZ NOT NULL,
    location    TEXT,
    cause       TEXT,
    outage_type TEXT,
    start_date  TEXT,
    end_date    TEXT,
    asn_name    TEXT,
    raw         JSONB
);
SELECT create_hypertable('recorded_outages', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_outages', INTERVAL '7 days', if_not_exists => TRUE);

-- Cyber Threats (OTX)
CREATE TABLE IF NOT EXISTS recorded_threats (
    ts          TIMESTAMPTZ NOT NULL,
    pulse_id    TEXT,
    name        TEXT,
    adversary   TEXT,
    targeted_country TEXT,
    lon         DOUBLE PRECISION,
    lat         DOUBLE PRECISION,
    geom        GEOMETRY(Point, 4326),
    raw         JSONB
);
SELECT create_hypertable('recorded_threats', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_threats', INTERVAL '7 days', if_not_exists => TRUE);
```

**Step 3: Verify the schema loads**

Run: `cd /home/volta/argus && docker compose down postgis && docker compose up -d postgis`

Wait for healthy, then:

Run: `docker exec argus_postgis psql -U argus -d argus -c "\dx"`

Expected: Shows `postgis`, `pg_trgm`, and `timescaledb` extensions.

Run: `docker exec argus_postgis psql -U argus -d argus -c "\dt"`

Expected: Shows all `recorded_*` tables plus existing tables.

**Step 4: Commit**

```bash
git add docker-compose.yml infra/db/init.sql
git commit -m "feat: migrate to TimescaleDB with DVR recording hypertables"
```

---

## Task 2: Backend Recording API

**Files:**
- Create: `argus-api/src/routes/record.js`
- Modify: `argus-api/src/index.js:36-37` (add route)
- Create: `argus-api/src/db.js` (shared pg pool)

**Step 1: Create shared database pool**

Create `argus-api/src/db.js`:

```javascript
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

module.exports = pool;
```

**Step 2: Create recording routes**

Create `argus-api/src/routes/record.js`:

```javascript
const express = require("express");
const pool = require("../db");

const router = express.Router();

router.post("/flights", async (req, res) => {
  const { flights } = req.body;
  if (!Array.isArray(flights) || flights.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const f of flights) {
    if (f.latitude == null || f.longitude == null) continue;
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326))`
    );
    params.push(
      ts, f.id, f.callsign || null, f.longitude, f.latitude,
      f.altitudeMeters || 0, f.velocity || 0, f.trueTrack || 0,
      f.verticalRate || null, f.onGround || false,
      f.originCountry || null, f.squawk || null,
      f.longitude, f.latitude
    );
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_flights (ts, icao24, callsign, lon, lat, alt_m, velocity, heading, vertical_rate, on_ground, origin_country, squawk, geom)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/flights error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/military", async (req, res) => {
  const { flights } = req.body;
  if (!Array.isArray(flights) || flights.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const f of flights) {
    if (f.latitude == null || f.longitude == null) continue;
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326))`
    );
    params.push(
      ts, f.id, f.callsign || null, f.longitude, f.latitude,
      f.altitudeMeters || 0, f.velocity || 0, f.trueTrack || 0,
      f.type || null, f.longitude, f.latitude
    );
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_military (ts, icao24, callsign, lon, lat, alt_m, velocity, heading, aircraft_type, geom)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/military error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/satellites", async (req, res) => {
  const { satellites } = req.body;
  if (!Array.isArray(satellites) || satellites.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const s of satellites) {
    if (s.latitude == null || s.longitude == null) continue;
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326))`
    );
    params.push(
      ts, s.id, s.name || null, s.longitude, s.latitude,
      s.altitudeKm || 0, s.tle1 || null, s.tle2 || null,
      s.longitude, s.latitude
    );
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_satellites (ts, norad_id, name, lon, lat, alt_km, tle_line1, tle_line2, geom)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/satellites error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/quakes", async (req, res) => {
  const { quakes } = req.body;
  if (!Array.isArray(quakes) || quakes.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const q of quakes) {
    if (q.latitude == null || q.longitude == null) continue;
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326))`
    );
    params.push(
      ts, q.id, q.longitude, q.latitude, q.depthKm || 0,
      q.magnitude || 0, q.place || null, q.longitude, q.latitude
    );
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_quakes (ts, event_id, lon, lat, depth_km, magnitude, place, geom)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/quakes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/outages", async (req, res) => {
  const { outages } = req.body;
  if (!Array.isArray(outages) || outages.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const o of outages) {
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    params.push(
      ts, o.location || null, o.cause || null, o.type || null,
      o.startDate || null, o.endDate || null, o.asnName || null,
      JSON.stringify(o)
    );
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_outages (ts, location, cause, outage_type, start_date, end_date, asn_name, raw)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/outages error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/threats", async (req, res) => {
  const { threats } = req.body;
  if (!Array.isArray(threats) || threats.length === 0) {
    return res.json({ recorded: 0 });
  }

  const ts = new Date().toISOString();
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const t of threats) {
    const hasGeo = t.latitude != null && t.longitude != null;
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ${hasGeo ? `ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)` : "NULL"}, $${paramIndex++})`
    );
    const row = [ts, t.id || null, t.name || null, t.adversary || null, t.targetedCountry || null, t.longitude || null, t.latitude || null];
    if (hasGeo) row.push(t.longitude, t.latitude);
    row.push(JSON.stringify(t));
    params.push(...row);
  }

  if (values.length === 0) return res.json({ recorded: 0 });

  const sql = `INSERT INTO recorded_threats (ts, pulse_id, name, adversary, targeted_country, lon, lat, geom, raw)
    VALUES ${values.join(", ")}
    ON CONFLICT DO NOTHING`;

  try {
    const result = await pool.query(sql, params);
    res.json({ recorded: result.rowCount });
  } catch (err) {
    console.error("record/threats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

**Step 3: Register the route in index.js**

In `argus-api/src/index.js`, add after line 7:

```javascript
const recordRoutes = require("./routes/record");
```

And after line 37 (`app.use("/api/feeds", feedsRoutes);`), add:

```javascript
app.use("/api/record", recordRoutes);
```

**Step 4: Verify the API starts**

Run: `cd /home/volta/argus && docker compose up -d --build argus-api`

Run: `docker logs argus_api --tail 5`

Expected: `argus-api listening on port 3001`

**Step 5: Commit**

```bash
git add argus-api/src/db.js argus-api/src/routes/record.js argus-api/src/index.js
git commit -m "feat: add DVR recording API routes for all feeds"
```

---

## Task 3: Backend Playback API

**Files:**
- Create: `argus-api/src/routes/playback.js`
- Modify: `argus-api/src/index.js` (add route)

**Step 1: Create playback routes**

Create `argus-api/src/routes/playback.js`:

```javascript
const express = require("express");
const pool = require("../db");

const router = express.Router();

const DEFAULT_WINDOW = 30; // seconds

router.get("/flights", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT icao24 AS id, callsign, lon AS longitude, lat AS latitude,
              alt_m AS "altitudeMeters", velocity, heading AS "trueTrack",
              vertical_rate AS "verticalRate", on_ground AS "onGround",
              origin_country AS "originCountry", squawk
       FROM recorded_flights
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval
       ORDER BY ts DESC`,
      [ts, String(windowSec)]
    );

    // Dedupe: keep latest per icao24
    const byId = new Map();
    for (const row of result.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    res.json({ flights: Array.from(byId.values()) });
  } catch (err) {
    console.error("playback/flights error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/military", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT icao24 AS id, callsign, lon AS longitude, lat AS latitude,
              alt_m AS "altitudeMeters", velocity, heading AS "trueTrack",
              aircraft_type AS type
       FROM recorded_military
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval
       ORDER BY ts DESC`,
      [ts, String(windowSec)]
    );

    const byId = new Map();
    for (const row of result.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    res.json({ flights: Array.from(byId.values()) });
  } catch (err) {
    console.error("playback/military error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/satellites", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT norad_id AS id, name, lon AS longitude, lat AS latitude,
              alt_km AS "altitudeKm", tle_line1 AS tle1, tle_line2 AS tle2
       FROM recorded_satellites
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval
       ORDER BY ts DESC`,
      [ts, String(windowSec)]
    );

    const byId = new Map();
    for (const row of result.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    res.json({ satellites: Array.from(byId.values()) });
  } catch (err) {
    console.error("playback/satellites error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/quakes", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT event_id AS id, lon AS longitude, lat AS latitude,
              depth_km AS "depthKm", magnitude, place,
              EXTRACT(EPOCH FROM ts) * 1000 AS timestamp
       FROM recorded_quakes
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval`,
      [ts, String(windowSec)]
    );

    const byId = new Map();
    for (const row of result.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    res.json({ quakes: Array.from(byId.values()) });
  } catch (err) {
    console.error("playback/quakes error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/outages", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT location, cause, outage_type AS type,
              start_date AS "startDate", end_date AS "endDate",
              asn_name AS "asnName", raw
       FROM recorded_outages
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval`,
      [ts, String(windowSec)]
    );

    res.json({ outages: result.rows });
  } catch (err) {
    console.error("playback/outages error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/threats", async (req, res) => {
  const { ts, window } = req.query;
  if (!ts) return res.status(400).json({ error: "ts required" });

  const windowSec = Number(window) || DEFAULT_WINDOW;

  try {
    const result = await pool.query(
      `SELECT pulse_id AS id, name, adversary,
              targeted_country AS "targetedCountry",
              lon AS longitude, lat AS latitude, raw
       FROM recorded_threats
       WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                     AND $1::timestamptz + ($2 || ' seconds')::interval`,
      [ts, String(windowSec)]
    );

    const byId = new Map();
    for (const row of result.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    res.json({ threats: Array.from(byId.values()) });
  } catch (err) {
    console.error("playback/threats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Time range: returns min/max recorded timestamps for the scrubber bounds
router.get("/range", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT MIN(ts) FROM recorded_flights) AS flights_min,
         (SELECT MAX(ts) FROM recorded_flights) AS flights_max,
         (SELECT MIN(ts) FROM recorded_military) AS military_min,
         (SELECT MAX(ts) FROM recorded_military) AS military_max`
    );

    const row = result.rows[0];
    const mins = [row.flights_min, row.military_min].filter(Boolean);
    const maxs = [row.flights_max, row.military_max].filter(Boolean);

    res.json({
      earliest: mins.length > 0 ? new Date(Math.min(...mins.map(d => new Date(d).getTime()))).toISOString() : null,
      latest: maxs.length > 0 ? new Date(Math.max(...maxs.map(d => new Date(d).getTime()))).toISOString() : null,
    });
  } catch (err) {
    console.error("playback/range error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

**Step 2: Register in index.js**

In `argus-api/src/index.js`, add after the record require:

```javascript
const playbackRoutes = require("./routes/playback");
```

And after the record route:

```javascript
app.use("/api/playback", playbackRoutes);
```

**Step 3: Rebuild and test**

Run: `cd /home/volta/argus && docker compose up -d --build argus-api`

Run: `curl -s http://localhost:3001/api/playback/range | jq .`

Expected: `{"earliest": null, "latest": null}` (no data recorded yet)

**Step 4: Commit**

```bash
git add argus-api/src/routes/playback.js argus-api/src/index.js
git commit -m "feat: add playback API routes for DVR timeline queries"
```

---

## Task 4: Frontend Recording Integration

**Files:**
- Create: `argus-app/src/lib/ingest/recorder.ts`
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (add recording calls to each poller)

**Step 1: Create recorder module**

Create `argus-app/src/lib/ingest/recorder.ts`:

```typescript
const RECORD_BASE = "/api/record";

async function recordBatch(endpoint: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${RECORD_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Recording failures are non-critical — don't break live feeds
  }
}

export function recordFlights(flights: Array<Record<string, unknown>>): void {
  if (flights.length === 0) return;
  void recordBatch("flights", { flights });
}

export function recordMilitary(flights: Array<Record<string, unknown>>): void {
  if (flights.length === 0) return;
  void recordBatch("military", { flights });
}

export function recordSatellites(satellites: Array<Record<string, unknown>>): void {
  if (satellites.length === 0) return;
  void recordBatch("satellites", { satellites });
}

export function recordQuakes(quakes: Array<Record<string, unknown>>): void {
  if (quakes.length === 0) return;
  void recordBatch("quakes", { quakes });
}

export function recordOutages(outages: Array<Record<string, unknown>>): void {
  if (outages.length === 0) return;
  void recordBatch("outages", { outages });
}

export function recordThreats(threats: Array<Record<string, unknown>>): void {
  if (threats.length === 0) return;
  void recordBatch("threats", { threats });
}
```

**Step 2: Add recording calls to CesiumGlobe.tsx polling handlers**

In `argus-app/src/components/CesiumGlobe.tsx`, add import at top (after line 47):

```typescript
import { recordFlights, recordMilitary, recordSatellites, recordQuakes, recordOutages, recordThreats } from "@/lib/ingest/recorder";
```

Then in each polling `run` function, add a recording call right after the successful data fetch. The pattern for each:

**OpenSky poller** (around line 684, after `flightAlertsRef.current = analyzeFlights(bounded);`):

Add: `recordFlights(bounded);`

**ADS-B military poller** (around line 709, after `militaryAlertsRef.current = analyzeMilitary(bounded);`):

Add: `recordMilitary(bounded);`

**Satellites poller** (around line 736, after `satelliteAlertsRef.current = analyzeSatellites(count);`):

Add: `recordSatellites(positions);`

Note: For satellites, we need the computed positions. Adjust the satellite poller to capture positions. Change the satellite poller section to capture the positions from `computeSatellitePositions`. Specifically, the `satLayer.update()` call internally computes positions. We need to expose those. Instead, we can compute them separately:

After `satLayer.setRecords(records.slice(0, ARGUS_CONFIG.limits.maxSatellites));` and before/after `satLayer.update()`, add:

```typescript
const satPositions = computeSatellitePositions(
  satLayer.getRecords(),
  new Date()
);
recordSatellites(satPositions.map(s => ({
  ...s,
  tle1: satLayer.getRecords().find(r => r.id === s.id)?.tle1,
  tle2: satLayer.getRecords().find(r => r.id === s.id)?.tle2,
})));
```

This requires adding a `getRecords()` method to SatelliteLayer. Add to `argus-app/src/lib/cesium/layers/satelliteLayer.ts`:

```typescript
getRecords(): SatelliteRecord[] {
  return this.records;
}
```

Also add import of `computeSatellitePositions` at the top of CesiumGlobe.tsx if not already imported (it's imported via `tle` but may need direct import).

**USGS poller** (around line 754, after `seismicAlertsRef.current = analyzeSeismic(count);`):

Add: `recordQuakes(quakes);`

**Cloudflare Radar poller** (around line 792, after `setFeedHealthy("cfradar");`):

Add: `recordOutages(outages);`

**OTX poller** (around line 808, after `setFeedHealthy("otx");`):

Add: `recordThreats(threats);`

**Step 3: Rebuild frontend and verify recording**

Run: `cd /home/volta/argus && docker compose up -d --build argus-app`

Wait 30 seconds for data to flow, then:

Run: `docker exec argus_postgis psql -U argus -d argus -c "SELECT COUNT(*) FROM recorded_flights;"`

Expected: A number > 0

**Step 4: Commit**

```bash
git add argus-app/src/lib/ingest/recorder.ts argus-app/src/components/CesiumGlobe.tsx argus-app/src/lib/cesium/layers/satelliteLayer.ts
git commit -m "feat: record all live feed data to TimescaleDB DVR"
```

---

## Task 5: Zustand Playback State

**Files:**
- Modify: `argus-app/src/types/intel.ts` (add PlaybackMode type)
- Modify: `argus-app/src/store/useArgusStore.ts` (add playback state + actions)

**Step 1: Add PlaybackMode type**

In `argus-app/src/types/intel.ts`, add after the `PlatformMode` type (line 5):

```typescript
export type PlaybackMode = "live" | "playback";
```

**Step 2: Add playback state to Zustand store**

In `argus-app/src/store/useArgusStore.ts`, add to the `ArgusStore` type (after line 82, before the closing `};`):

```typescript
  // DVR Playback
  playbackMode: PlaybackMode;
  playbackTime: Date | null;
  playbackSpeed: number;
  isPlaying: boolean;
  playbackRange: { start: Date; end: Date } | null;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPlaybackTime: (time: Date | null) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackRange: (range: { start: Date; end: Date } | null) => void;
  goLive: () => void;
  enterPlayback: (time: Date) => void;
```

Add the import at top:

```typescript
import type { PlaybackMode } from "@/types/intel";
```

Add the initial state and actions in the `create` function (before the closing `}));`):

```typescript
  // DVR Playback
  playbackMode: "live" as PlaybackMode,
  playbackTime: null,
  playbackSpeed: 1,
  isPlaying: false,
  playbackRange: null,
  setPlaybackMode: (mode) => set({ playbackMode: mode }),
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackRange: (range) => set({ playbackRange: range }),
  goLive: () => set({ playbackMode: "live", playbackTime: null, isPlaying: false }),
  enterPlayback: (time) => set({ playbackMode: "playback", playbackTime: time, isPlaying: false }),
```

**Step 3: Verify TypeScript compiles**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors related to playback types.

**Step 4: Commit**

```bash
git add argus-app/src/types/intel.ts argus-app/src/store/useArgusStore.ts
git commit -m "feat: add DVR playback state to Zustand store"
```

---

## Task 6: Layer Playback Mode Support

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (conditionally fetch from playback API when in playback mode)

**Step 1: Add playback data fetching**

In `CesiumGlobe.tsx`, add a playback-aware wrapper. The key change: in each poller's `run` function, check `playbackMode`. If in playback mode, skip the poller entirely (data comes from a separate playback loop). Add a new `useEffect` that runs the playback loop.

After the poller cleanup return (around line 873), add a new `useEffect` for playback:

```typescript
  // Playback data loop
  useEffect(() => {
    const store = useArgusStore.getState();
    if (store.playbackMode !== "playback") return;

    let animFrameId: number;
    let lastFrameTime = performance.now();

    const tick = async (now: number) => {
      const state = useArgusStore.getState();
      if (state.playbackMode !== "playback") return;

      // Advance playback time if playing
      if (state.isPlaying && state.playbackTime) {
        const delta = (now - lastFrameTime) / 1000; // seconds
        const newTime = new Date(state.playbackTime.getTime() + delta * state.playbackSpeed * 1000);
        useArgusStore.setState({ playbackTime: newTime });
      }
      lastFrameTime = now;

      const playbackTime = useArgusStore.getState().playbackTime;
      if (!playbackTime) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      const ts = playbackTime.toISOString();
      const viewer = viewerRef.current;
      if (!viewer) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      try {
        // Fetch all feeds in parallel
        const [flightsRes, milRes, satRes, quakeRes, outageRes, threatRes] = await Promise.all([
          fetch(`/api/playback/flights?ts=${ts}&window=30`).then(r => r.json()),
          fetch(`/api/playback/military?ts=${ts}&window=30`).then(r => r.json()),
          fetch(`/api/playback/satellites?ts=${ts}&window=30`).then(r => r.json()),
          fetch(`/api/playback/quakes?ts=${ts}&window=30`).then(r => r.json()),
          fetch(`/api/playback/outages?ts=${ts}&window=30`).then(r => r.json()),
          fetch(`/api/playback/threats?ts=${ts}&window=30`).then(r => r.json()),
        ]);

        // Update layers with playback data
        if (flightLayerRef.current && flightsRes.flights) {
          flightLayerRef.current.upsertFlights(flightsRes.flights);
          setCount("flights", flightsRes.flights.length);
        }
        if (militaryLayerRef.current && milRes.flights) {
          militaryLayerRef.current.upsertFlights(milRes.flights);
          setCount("military", milRes.flights.length);
        }
        if (satLayerRef.current && satRes.satellites) {
          // For playback, satellites come pre-computed from DB
          // We render them as direct positions
          const satPositions = satRes.satellites.map((s: any) => ({
            id: s.id,
            name: s.name,
            longitude: s.longitude,
            latitude: s.latitude,
            altitudeKm: s.altitudeKm,
          }));
          // Use upsert-like pattern for satellites
          setCount("satellites", satPositions.length);
        }
        if (seismicLayerRef.current && quakeRes.quakes) {
          seismicLayerRef.current.upsertEarthquakes(quakeRes.quakes);
          setCount("seismic", quakeRes.quakes.length);
        }
        if (outageLayerRef.current && outageRes.outages) {
          outageLayerRef.current.update(outageRes.outages);
          setCount("outages", outageRes.outages.length);
        }
        if (threatLayerRef.current && threatRes.threats) {
          threatLayerRef.current.update(threatRes.threats);
          setCount("threats", threatRes.threats.length);
        }
      } catch {
        // Playback fetch errors are non-critical
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [useArgusStore.getState().playbackMode, setCount]);
```

Also update each poller's `run` function to skip when in playback mode. Change the existing check from:

```typescript
if (platformModeRef.current === "analytics") return;
```

To:

```typescript
if (platformModeRef.current === "analytics" || useArgusStore.getState().playbackMode === "playback") return;
```

Do this for ALL pollers (opensky, adsb-military, satellites, usgs, cctv, cloudflare-radar, otx, fred, aisstream).

**Step 2: Verify**

Run: `cd /home/volta/argus/argus-app && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors

**Step 3: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat: add playback data loop for DVR timeline replay"
```

---

## Task 7: Timeline Scrubber Component

**Files:**
- Create: `argus-app/src/components/TimelineScrubber.tsx`
- Modify: `argus-app/src/components/HudOverlay.tsx` (render the scrubber)

**Step 1: Create TimelineScrubber component**

Create `argus-app/src/components/TimelineScrubber.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useArgusStore } from "@/store/useArgusStore";

const SPEEDS = [1, 5, 15, 60];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TimelineScrubber() {
  const playbackMode = useArgusStore((s) => s.playbackMode);
  const playbackTime = useArgusStore((s) => s.playbackTime);
  const playbackSpeed = useArgusStore((s) => s.playbackSpeed);
  const isPlaying = useArgusStore((s) => s.isPlaying);
  const playbackRange = useArgusStore((s) => s.playbackRange);
  const setPlaybackTime = useArgusStore((s) => s.setPlaybackTime);
  const setPlaybackSpeed = useArgusStore((s) => s.setPlaybackSpeed);
  const setIsPlaying = useArgusStore((s) => s.setIsPlaying);
  const goLive = useArgusStore((s) => s.goLive);
  const enterPlayback = useArgusStore((s) => s.enterPlayback);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  // Fetch available range on mount
  useEffect(() => {
    async function fetchRange() {
      try {
        const res = await fetch("/api/playback/range");
        const data = await res.json();
        if (data.earliest && data.latest) {
          const r = {
            start: new Date(data.earliest),
            end: new Date(data.latest),
          };
          setRange(r);
          useArgusStore.setState({ playbackRange: r });
        }
      } catch {
        // no data yet
      }
    }
    fetchRange();
    const interval = setInterval(fetchRange, 30_000);
    return () => clearInterval(interval);
  }, []);

  const effectiveRange = playbackRange || range;

  const scrubToPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current || !effectiveRange) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ms = effectiveRange.start.getTime() + pct * (effectiveRange.end.getTime() - effectiveRange.start.getTime());
      const newTime = new Date(ms);
      setPlaybackTime(newTime);
      if (playbackMode === "live") {
        enterPlayback(newTime);
      }
    },
    [effectiveRange, playbackMode, setPlaybackTime, enterPlayback],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      scrubToPosition(e.clientX);
    },
    [scrubToPosition],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => scrubToPosition(e.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, scrubToPosition]);

  const progress =
    effectiveRange && playbackTime
      ? (playbackTime.getTime() - effectiveRange.start.getTime()) /
        (effectiveRange.end.getTime() - effectiveRange.start.getTime())
      : 0;

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(playbackSpeed);
    setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  }, [playbackSpeed, setPlaybackSpeed]);

  const stepBack = useCallback(() => {
    if (!playbackTime) return;
    setPlaybackTime(new Date(playbackTime.getTime() - 60_000));
  }, [playbackTime, setPlaybackTime]);

  const stepForward = useCallback(() => {
    if (!playbackTime) return;
    setPlaybackTime(new Date(playbackTime.getTime() + 60_000));
  }, [playbackTime, setPlaybackTime]);

  const noData = !effectiveRange;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 bg-black/80 border-t border-green-900/50 px-4 py-2 font-mono text-xs text-green-400 backdrop-blur-sm">
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={stepBack}
          disabled={noData || playbackMode === "live"}
          className="px-1.5 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30"
          title="Step back 1 min"
        >
          {"<<"}
        </button>
        <button
          onClick={() => {
            if (playbackMode === "live" && effectiveRange) {
              enterPlayback(effectiveRange.end);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
          disabled={noData}
          className="px-2 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30 min-w-[28px]"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying && playbackMode === "playback" ? "||" : "\u25B6"}
        </button>
        <button
          onClick={stepForward}
          disabled={noData || playbackMode === "live"}
          className="px-1.5 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30"
          title="Step forward 1 min"
        >
          {">>"}
        </button>
      </div>

      {/* Scrubber track */}
      <div
        ref={trackRef}
        className="flex-1 h-3 bg-green-950/50 border border-green-900/30 cursor-pointer relative"
        onMouseDown={handleMouseDown}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 bg-green-700/40"
          style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
        />
        {/* Scrub head */}
        {playbackMode === "playback" && (
          <div
            className="absolute top-[-2px] w-2 h-[calc(100%+4px)] bg-green-400"
            style={{ left: `${Math.max(0, Math.min(100, progress * 100))}%`, transform: "translateX(-50%)" }}
          />
        )}
      </div>

      {/* Time display */}
      <div className="text-right min-w-[120px]">
        {playbackMode === "playback" && playbackTime ? (
          <span>
            {formatDate(playbackTime)} {formatTime(playbackTime)}
          </span>
        ) : (
          <span className="text-green-600">--:--:--</span>
        )}
      </div>

      {/* Speed control */}
      <button
        onClick={cycleSpeed}
        disabled={noData}
        className="px-2 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30 min-w-[36px]"
        title="Playback speed"
      >
        {playbackSpeed}x
      </button>

      {/* Live button */}
      <button
        onClick={goLive}
        className={`px-2 py-0.5 border font-bold ${
          playbackMode === "live"
            ? "border-red-500 text-red-400 bg-red-950/30"
            : "border-green-900/50 text-green-600 hover:bg-green-900/30"
        }`}
        title="Return to live"
      >
        LIVE
      </button>
    </div>
  );
}
```

**Step 2: Add TimelineScrubber to the page**

In `argus-app/src/components/HudOverlay.tsx`, import and render the TimelineScrubber. Add import at top:

```typescript
import { TimelineScrubber } from "./TimelineScrubber";
```

Then render `<TimelineScrubber />` at the bottom of the component's return JSX, as a sibling of the existing HUD elements (right before the closing fragment or wrapper div).

**Step 3: Verify it renders**

Run: `cd /home/volta/argus && docker compose up -d --build argus-app`

Open browser, verify the timeline bar appears at the bottom of the screen.

**Step 4: Commit**

```bash
git add argus-app/src/components/TimelineScrubber.tsx argus-app/src/components/HudOverlay.tsx
git commit -m "feat: add timeline scrubber component for DVR playback"
```

---

## Task 8: Integration Testing + Nginx Route

**Files:**
- Modify: `nginx/nginx.conf` (add `/api/record` and `/api/playback` routes if not already covered)

**Step 1: Verify nginx routes**

Check if the nginx config already routes `/api/` to the API backend. If it routes all `/api/*` traffic, no changes needed. If it only routes specific paths, add:

```nginx
location /api/record/ {
    proxy_pass http://argus-api:3001;
}

location /api/playback/ {
    proxy_pass http://argus-api:3001;
}
```

**Step 2: Full stack integration test**

Run: `cd /home/volta/argus && docker compose up -d --build`

1. Wait 60 seconds for feeds to start flowing
2. Check recording: `docker exec argus_postgis psql -U argus -d argus -c "SELECT 'flights' AS feed, COUNT(*) FROM recorded_flights UNION ALL SELECT 'military', COUNT(*) FROM recorded_military UNION ALL SELECT 'quakes', COUNT(*) FROM recorded_quakes;"`
3. Check playback range: `curl -s http://localhost/api/playback/range | jq .`
4. Test playback query: Use the latest timestamp from range, then: `curl -s "http://localhost/api/playback/flights?ts=<TIMESTAMP>&window=30" | jq '.flights | length'`
5. Open browser, verify timeline scrubber is visible
6. Click on the timeline to enter playback mode
7. Click Play, verify entities move on the globe
8. Click LIVE to return to live mode

**Step 3: Commit any nginx changes**

```bash
git add nginx/nginx.conf
git commit -m "feat: add nginx routes for recording and playback APIs"
```

---

## Task 9: Final Polish + Playback Loop Throttle

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (throttle playback fetches)

**Step 1: Throttle playback API calls**

The `requestAnimationFrame` loop fires at 60fps but we don't need to query the DB that often. Add a throttle to only fetch every 500ms:

In the playback `useEffect` tick function, add a lastFetch timestamp check:

```typescript
let lastFetchTime = 0;
const FETCH_INTERVAL = 500; // ms

// Inside tick(), before the fetch block:
if (now - lastFetchTime < FETCH_INTERVAL) {
  animFrameId = requestAnimationFrame(tick);
  return;
}
lastFetchTime = now;
```

**Step 2: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat: throttle playback API calls to 500ms intervals"
```

---

## Summary of all tasks

| Task | Description | Independent? |
|------|-------------|-------------|
| 1 | Docker + TimescaleDB schema | Yes (do first) |
| 2 | Backend recording API | Depends on 1 |
| 3 | Backend playback API | Depends on 1 |
| 4 | Frontend recording integration | Depends on 2 |
| 5 | Zustand playback state | Independent |
| 6 | Layer playback mode support | Depends on 3, 5 |
| 7 | Timeline scrubber component | Depends on 5 |
| 8 | Integration testing + nginx | Depends on all |
| 9 | Final polish + throttle | Depends on 6 |

**Parallel groups:**
- Group A: Tasks 2 + 3 (backend, both depend on Task 1)
- Group B: Tasks 4 + 5 (frontend, independent of each other)
- Group C: Tasks 6 + 7 (frontend, both depend on 5)
- Sequential: Task 1 → [2,3] → [4,5] → [6,7] → 8 → 9

-- Argus PostGIS + TimescaleDB Schema
-- Initialised on first container start

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ----------------------------------------------------------------
-- weather_layers (existing)
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
-- Supports latest-per-variable queries (DISTINCT ON variable ORDER BY valid_time DESC)
CREATE INDEX IF NOT EXISTS idx_wl_variable_valid_time_desc
    ON weather_layers (variable, valid_time DESC)
    INCLUDE (name, tile_url, file_size_mb);

-- ----------------------------------------------------------------
-- flight_routes (existing)
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- analytics_sessions (existing)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id            SERIAL PRIMARY KEY,
    started_at    TIMESTAMPTZ   DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    layers_viewed TEXT[]        DEFAULT '{}'
);

-- ================================================================
-- DVR Recording Hypertables
-- ================================================================

-- Commercial flights (OpenSky)
CREATE TABLE IF NOT EXISTS recorded_flights (
    ts              TIMESTAMPTZ NOT NULL,
    icao24          TEXT NOT NULL,
    callsign        TEXT,
    lon             DOUBLE PRECISION,
    lat             DOUBLE PRECISION,
    alt_m           DOUBLE PRECISION,
    velocity        DOUBLE PRECISION,
    heading         DOUBLE PRECISION,
    vertical_rate   DOUBLE PRECISION,
    on_ground       BOOLEAN DEFAULT FALSE,
    origin_country  TEXT,
    squawk          TEXT,
    nacp            SMALLINT,
    geom            GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_flights', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_flights', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rf_ts_icao ON recorded_flights (ts, icao24);
CREATE INDEX IF NOT EXISTS idx_rf_geom ON recorded_flights USING GIST (geom);

-- Military flights (ADS-B)
CREATE TABLE IF NOT EXISTS recorded_military (
    ts              TIMESTAMPTZ NOT NULL,
    icao24          TEXT NOT NULL,
    callsign        TEXT,
    lon             DOUBLE PRECISION,
    lat             DOUBLE PRECISION,
    alt_m           DOUBLE PRECISION,
    velocity        DOUBLE PRECISION,
    heading         DOUBLE PRECISION,
    aircraft_type   TEXT,
    geom            GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_military', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_military', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rm_ts_icao ON recorded_military (ts, icao24);
CREATE INDEX IF NOT EXISTS idx_rm_geom ON recorded_military USING GIST (geom);

-- Satellites (CelesTrak TLE)
CREATE TABLE IF NOT EXISTS recorded_satellites (
    ts              TIMESTAMPTZ NOT NULL,
    norad_id        TEXT NOT NULL,
    name            TEXT,
    lon             DOUBLE PRECISION,
    lat             DOUBLE PRECISION,
    alt_km          DOUBLE PRECISION,
    tle_line1       TEXT,
    tle_line2       TEXT,
    geom            GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_satellites', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_satellites', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rs_ts_norad ON recorded_satellites (ts, norad_id);
CREATE INDEX IF NOT EXISTS idx_rs_geom ON recorded_satellites USING GIST (geom);

-- Earthquakes (USGS)
CREATE TABLE IF NOT EXISTS recorded_quakes (
    ts              TIMESTAMPTZ NOT NULL,
    event_id        TEXT NOT NULL,
    lon             DOUBLE PRECISION,
    lat             DOUBLE PRECISION,
    depth_km        DOUBLE PRECISION,
    magnitude       DOUBLE PRECISION,
    place           TEXT,
    geom            GEOMETRY(Point, 4326)
);
SELECT create_hypertable('recorded_quakes', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_quakes', INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_rq_ts_event ON recorded_quakes (ts, event_id);

-- Internet Outages (Cloudflare Radar)
CREATE TABLE IF NOT EXISTS recorded_outages (
    ts              TIMESTAMPTZ NOT NULL,
    location        TEXT,
    cause           TEXT,
    outage_type     TEXT,
    start_date      TEXT,
    end_date        TEXT,
    asn_name        TEXT,
    raw             JSONB
);
SELECT create_hypertable('recorded_outages', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_outages', INTERVAL '7 days', if_not_exists => TRUE);

-- Cyber Threats (OTX)
CREATE TABLE IF NOT EXISTS recorded_threats (
    ts                  TIMESTAMPTZ NOT NULL,
    pulse_id            TEXT,
    name                TEXT,
    adversary           TEXT,
    targeted_country    TEXT,
    lon                 DOUBLE PRECISION,
    lat                 DOUBLE PRECISION,
    geom                GEOMETRY(Point, 4326),
    raw                 JSONB
);
SELECT create_hypertable('recorded_threats', 'ts', if_not_exists => TRUE);
SELECT add_retention_policy('recorded_threats', INTERVAL '7 days', if_not_exists => TRUE);

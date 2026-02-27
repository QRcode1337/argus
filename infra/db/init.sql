-- Argus PostGIS Schema
-- Initialised on first container start

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------
-- weather_layers
-- Tracks every Cloud-Optimised GeoTIFF produced by the ingestor.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_layers (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120)  NOT NULL,          -- human label, e.g. "GFS Temperature 2m"
    variable      VARCHAR(50)   NOT NULL,          -- GRIB2 shortName, e.g. "t2m", "u10", "v10"
    level         VARCHAR(80),                     -- e.g. "2 m above ground"
    valid_time    TIMESTAMPTZ   NOT NULL,          -- forecast valid time
    forecast_hour SMALLINT      DEFAULT 0,         -- 0 = analysis
    run_time      TIMESTAMPTZ   NOT NULL,          -- model run time (00z, 06z, 12z, 18z)
    bbox          GEOMETRY(POLYGON, 4326),         -- spatial extent (global = world bbox)
    cog_path      VARCHAR(500)  NOT NULL,          -- absolute path inside container, e.g. /data/tiles/gfs_t2m_20260226_00z.tif
    tile_url      VARCHAR(500),                    -- TiTiler URL template ready for Cesium
    file_size_mb  NUMERIC(8,2),
    created_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wl_valid_time  ON weather_layers (valid_time DESC);
CREATE INDEX IF NOT EXISTS idx_wl_variable    ON weather_layers (variable);
CREATE INDEX IF NOT EXISTS idx_wl_run_time    ON weather_layers (run_time DESC);
CREATE INDEX IF NOT EXISTS idx_wl_bbox        ON weather_layers USING GIST (bbox);

-- ----------------------------------------------------------------
-- flight_routes
-- Historical flight path storage for Analytics mode replay.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_routes (
    id          SERIAL PRIMARY KEY,
    icao24      VARCHAR(10)   NOT NULL,
    callsign    VARCHAR(20),
    origin      VARCHAR(6),
    destination VARCHAR(6),
    departed_at TIMESTAMPTZ,
    arrived_at  TIMESTAMPTZ,
    path        GEOMETRY(LINESTRING, 4326),        -- full 4D track as 2D projection
    altitude_m  NUMERIC(8,1)[],                    -- altitude at each path point
    source      VARCHAR(40)   DEFAULT 'opensky',
    created_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fr_icao24      ON flight_routes (icao24);
CREATE INDEX IF NOT EXISTS idx_fr_departed_at ON flight_routes (departed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fr_path        ON flight_routes USING GIST (path);

-- ----------------------------------------------------------------
-- analytics_sessions  (lightweight audit log)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id            SERIAL PRIMARY KEY,
    started_at    TIMESTAMPTZ   DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    layers_viewed TEXT[]        DEFAULT '{}'
);

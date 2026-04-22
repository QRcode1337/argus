-- Telemetry tables for FTLE-PNEUMA pipeline
-- Run against PostgreSQL 14+

BEGIN;

-- ============================================================
-- ftle_events: stores FTLE spike detections from Phantom sidecar
-- ============================================================
CREATE TABLE IF NOT EXISTS ftle_events (
  id            BIGSERIAL        PRIMARY KEY,
  event_type    TEXT             NOT NULL DEFAULT 'ftle_spike',
  field         TEXT             NOT NULL,
  ftle_value    DOUBLE PRECISION NOT NULL,
  gradient_mag  DOUBLE PRECISION NOT NULL,
  gradient_dir  DOUBLE PRECISION NOT NULL,
  delta         DOUBLE PRECISION NOT NULL,
  window_size   INTEGER          NOT NULL DEFAULT 10,
  regime_label  TEXT,
  node          TEXT             NOT NULL,
  emitted_at    TIMESTAMPTZ      NOT NULL,
  ingested_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftle_events_emitted_at   ON ftle_events (emitted_at);
CREATE INDEX IF NOT EXISTS idx_ftle_events_field        ON ftle_events (field);
CREATE INDEX IF NOT EXISTS idx_ftle_events_regime_label ON ftle_events (regime_label);

-- ============================================================
-- pneuma_latency: tracks PNEUMA API response latencies
-- ============================================================
CREATE TABLE IF NOT EXISTS pneuma_latency (
  id            BIGSERIAL        PRIMARY KEY,
  route         TEXT             NOT NULL,
  context       TEXT,
  latency_ms    DOUBLE PRECISION NOT NULL,
  status_code   INTEGER,
  model_used    TEXT,
  provider      TEXT,
  responded_at  TIMESTAMPTZ      NOT NULL,
  ingested_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pneuma_latency_responded_at ON pneuma_latency (responded_at);
CREATE INDEX IF NOT EXISTS idx_pneuma_latency_context      ON pneuma_latency (context);

-- ============================================================
-- sona_observations: SONA routing decisions with reservoir state
-- ============================================================
CREATE TABLE IF NOT EXISTS sona_observations (
  id                        BIGSERIAL        PRIMARY KEY,
  ftle_field                TEXT,
  ftle_value                DOUBLE PRECISION,
  gradient_magnitude        DOUBLE PRECISION,
  gradient_direction        DOUBLE PRECISION,
  regime_label              TEXT,
  model_selected            TEXT             NOT NULL,
  provider                  TEXT             NOT NULL,
  routing_confidence        DOUBLE PRECISION,
  reservoir_spectral_radius DOUBLE PRECISION,
  reservoir_leak_rate       DOUBLE PRECISION,
  reservoir_input_scaling   DOUBLE PRECISION,
  response_latency_ms       DOUBLE PRECISION,
  token_cost                DOUBLE PRECISION,
  quality_score             DOUBLE PRECISION,
  task_type                 TEXT,
  chaos_score               DOUBLE PRECISION,
  importance_flag           BOOLEAN          DEFAULT FALSE,
  observed_at               TIMESTAMPTZ      NOT NULL,
  created_at                TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sona_observations_regime_label   ON sona_observations (regime_label);
CREATE INDEX IF NOT EXISTS idx_sona_observations_observed_at    ON sona_observations (observed_at);
CREATE INDEX IF NOT EXISTS idx_sona_observations_model_selected ON sona_observations (model_selected);

COMMIT;

-- ============================================================
-- Correlation query: join FTLE spikes with SONA routing decisions
-- to analyze how chaos regime affects model selection & quality.
-- ============================================================
-- SELECT
--   f.field,
--   f.ftle_value,
--   f.regime_label,
--   s.model_selected,
--   s.provider,
--   s.routing_confidence,
--   s.response_latency_ms,
--   s.quality_score,
--   s.chaos_score
-- FROM ftle_events f
-- JOIN sona_observations s
--   ON f.field = s.ftle_field
--  AND s.observed_at BETWEEN f.emitted_at - INTERVAL '5 seconds'
--                        AND f.emitted_at + INTERVAL '5 seconds'
-- WHERE f.emitted_at > NOW() - INTERVAL '1 hour'
-- ORDER BY f.emitted_at DESC;

-- Add anomaly_events table to support Phantom integration
-- Run against PostgreSQL 14+

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- anomaly_events: stores real-time output from Phantom Engine
-- ============================================================
CREATE TABLE IF NOT EXISTS anomaly_events (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50)      NOT NULL, -- flight, seismic, weather
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  chaos_score   DOUBLE PRECISION NOT NULL CHECK (chaos_score >= 0 AND chaos_score <= 1), -- 0.0 - 1.0
  severity      VARCHAR(20)      NOT NULL, -- low, medium, high, critical
  source_data   JSONB            NOT NULL, -- Original feed data
  detected_at   TIMESTAMPTZ      NOT NULL,
  ingested_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_detected_at ON anomaly_events (detected_at);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type        ON anomaly_events (event_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity    ON anomaly_events (severity);

COMMIT;

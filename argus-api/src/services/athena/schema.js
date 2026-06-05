const pool = require("../../db");

const ATHENA_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS anomaly_events (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50)      NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  chaos_score   DOUBLE PRECISION NOT NULL CHECK (chaos_score >= 0 AND chaos_score <= 1),
  severity      VARCHAR(20)      NOT NULL,
  source_data   JSONB            NOT NULL,
  detected_at   TIMESTAMPTZ      NOT NULL,
  ingested_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_detected_at ON anomaly_events (detected_at);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type        ON anomaly_events (event_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity    ON anomaly_events (severity);

CREATE TABLE IF NOT EXISTS athena_action_packets (
  id UUID PRIMARY KEY,
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'proposed',
  region_label TEXT NOT NULL,
  region JSONB NOT NULL,
  trigger JSONB NOT NULL,
  proposed_action JSONB NOT NULL,
  explanation JSONB NOT NULL,
  safe_alternatives JSONB NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  machine_actions JSONB NOT NULL,
  decision JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athena_action_packets_status ON athena_action_packets (status);
CREATE INDEX IF NOT EXISTS idx_athena_action_packets_priority ON athena_action_packets (priority);
CREATE INDEX IF NOT EXISTS idx_athena_action_packets_created_at ON athena_action_packets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athena_action_packets_region_label ON athena_action_packets (region_label);
`;

let defaultSchemaPromise = null;

async function ensureAthenaSchema(db = pool) {
  if (db === pool) {
    if (!defaultSchemaPromise) {
      defaultSchemaPromise = db.query(ATHENA_SCHEMA_SQL).catch((error) => {
        defaultSchemaPromise = null;
        throw error;
      });
    }
    await defaultSchemaPromise;
    return;
  }

  await db.query(ATHENA_SCHEMA_SQL);
}

module.exports = {
  ATHENA_SCHEMA_SQL,
  ensureAthenaSchema,
};

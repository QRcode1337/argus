BEGIN;

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

COMMIT;

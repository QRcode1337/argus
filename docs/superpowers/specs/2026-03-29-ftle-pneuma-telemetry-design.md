# FTLE-PNEUMA Telemetry Correlation Pipeline

**Date:** 2026-03-29
**Status:** Approved
**Origin:** Pieces chat export — "ARGUS Anomaly Tagging and Taxonomy Refinement" (March 28, 2026)

## Overview

Instrument ARGUS API routes with latency logging, standardize the anomaly taxonomy for Phantom and Zerve sources, and create PostgreSQL schemas + ingestion code to enable correlation analysis between FTLE field spikes and PNEUMA response times.

## Scope

### In Scope
1. **PNEUMA Latency Instrumentation** — timing wrappers on `/api/ai/summarize` and `/api/pneuma/state`
2. **Anomaly Taxonomy Standardization** — extend types in `analysisEngine.ts` with unified category/sub-type tags
3. **PostgreSQL Schemas + Ingestion** — `pg` dependency, shared Pool, 3 tables, migration file, ingestion modules

### Out of Scope
- SONA observation writer (Agentica not in this repo)
- Rust-side Phantom engine changes (separate repo)
- Tier 2/3 regime-gated routing (depends on 48-72h of Tier 1 data)

## 1. PNEUMA Latency Instrumentation

### New Files
- `argus-app/src/lib/telemetry/db.ts` — shared `pg.Pool` singleton from `DATABASE_URL`
- `argus-app/src/lib/telemetry/pneumaLatencyLogger.ts` — fire-and-forget latency logging

### Modified Files
- `argus-app/src/app/api/ai/summarize/route.ts` — wrap handler with `performance.now()` timing
- `argus-app/src/app/api/pneuma/state/route.ts` — wrap handler with `performance.now()` timing

### Behavior
- Timing starts at request entry, ends before response
- `logPneumaLatency()` is called fire-and-forget (`.catch(console.error)`)
- If `DATABASE_URL` is not set, logging is a no-op (graceful degradation)
- Logged fields: route, context, latency_ms, status_code, responded_at

## 2. Anomaly Taxonomy Standardization

### Modified Files
- `argus-app/src/lib/intel/analysisEngine.ts`

### Type Changes

```typescript
// Source engine enum
type AnomalySourceEngine = "PHANTOM" | "ZERVE";

// Sub-types per source
type PhantomSubType = "trajectory_chaos" | "anomalous_velocity" | "extreme_climb" | "extreme_descent";
type ZerveSubType = "cluster" | "proximity" | "trend";
type AnomalySubType = PhantomSubType | ZerveSubType;

// Confidence tiers
type ConfidenceTier = "high" | "moderate" | "low"; // <0.5 filtered

// Extended anomaly type
interface UnifiedAnomaly {
  entity_id: string;
  source_engine: AnomalySourceEngine;
  anomaly_type: AnomalySubType;
  chaos_score: number;
  confidence: number;
  confidence_tier: ConfidenceTier;
  severity: "Critical" | "High" | "Medium" | "Low";
  importance: "important" | "routine";
  lat: number;
  lon: number;
  detail: string;
  detected_at: string;
  context: "anomaly";
}
```

### Importance Rules
- `importance: "important"` if severity is Critical/High OR chaos_score >= 0.70
- Otherwise `importance: "routine"`

### Confidence Tiers
- 0.9-1.0: "high" — clear statistical signal
- 0.7-0.9: "moderate" — detectable pattern, potential noise
- 0.5-0.7: "low" — preliminary signal
- <0.5: filtered out, not surfaced

### AlertCategory Extension
- Add `"ZERVE"` to the `AlertCategory` union type

## 3. PostgreSQL Schemas + Ingestion

### New Files
- `argus-app/migrations/001_telemetry_tables.sql` — CREATE TABLE statements
- `argus-app/src/lib/telemetry/db.ts` — shared Pool (also used by #1)
- `argus-app/src/lib/telemetry/ftleEventIngester.ts` — ingests `ftle_spike` WebSocket events

### Tables

#### `ftle_events`
Ingested from Phantom Rust backend via WebSocket.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL PK | |
| event_type | TEXT | Default 'ftle_spike' |
| field | TEXT | e.g. "price_btc_usd" |
| ftle_value | DOUBLE PRECISION | |
| gradient_mag | DOUBLE PRECISION | ||nabla FTLE|| |
| gradient_dir | DOUBLE PRECISION | +1.0 / -1.0 |
| delta | DOUBLE PRECISION | |
| window_size | INTEGER | Default 10 |
| regime_label | TEXT | "chaotic" / "transitional" / "stable_elevated" |
| node | TEXT | Compute node ID |
| emitted_at | TIMESTAMPTZ | Phantom-side timestamp |
| ingested_at | TIMESTAMPTZ | Default NOW() |

#### `pneuma_latency`
Instrumented from Next.js API routes.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL PK | |
| route | TEXT | "/api/ai/summarize" etc |
| context | TEXT | "anomaly" / "default" / null |
| latency_ms | DOUBLE PRECISION | |
| status_code | INTEGER | |
| model_used | TEXT | Which model was routed to |
| provider | TEXT | "anthropic" / "google" / "openai" |
| responded_at | TIMESTAMPTZ | |
| ingested_at | TIMESTAMPTZ | Default NOW() |

#### `sona_observations`
Unified SONA meta-learner view (schema only — writer is out of scope).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL PK | |
| ftle_field | TEXT | |
| ftle_value | DOUBLE PRECISION | |
| gradient_magnitude | DOUBLE PRECISION | |
| gradient_direction | DOUBLE PRECISION | |
| regime_label | TEXT | |
| model_selected | TEXT | |
| provider | TEXT | |
| routing_confidence | DOUBLE PRECISION | |
| reservoir_spectral_radius | DOUBLE PRECISION | |
| reservoir_leak_rate | DOUBLE PRECISION | |
| reservoir_input_scaling | DOUBLE PRECISION | |
| response_latency_ms | DOUBLE PRECISION | |
| token_cost | DOUBLE PRECISION | |
| quality_score | DOUBLE PRECISION | |
| task_type | TEXT | |
| chaos_score | DOUBLE PRECISION | |
| importance_flag | BOOLEAN | Default FALSE |
| observed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | Default NOW() |

### Indexes
- `ftle_events`: emitted_at, field, regime_label
- `pneuma_latency`: responded_at, context
- `sona_observations`: regime_label, observed_at, model_selected

### Correlation Query
Join FTLE spikes with PNEUMA latency within +/-30s/+60s window where gradient_mag > 0.15.

## Data Flow

```
Phantom (Rust) --WebSocket--> ftleEventIngester.ts --> ftle_events (PostgreSQL)
/api/ai/summarize ----------> pneumaLatencyLogger.ts --> pneuma_latency (PostgreSQL)
/api/pneuma/state ----------> pneumaLatencyLogger.ts --> pneuma_latency (PostgreSQL)
```

## Graceful Degradation
- If `DATABASE_URL` is not set, all telemetry logging becomes a no-op
- API routes continue to function normally without database
- No user-facing errors from telemetry failures

## Dependencies
- `pg` npm package (new dependency)
- `DATABASE_URL` environment variable (DigitalOcean PostGIS droplet)

# Phantom Anomaly Detection Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phantom Rust chaos-math engine into ARGUS live feeds so flight trajectories, seismic patterns, and weather data are scored for anomalies in real-time, with alerts surfaced in the HUD.

**Architecture:** Phantom runs as a standalone Axum HTTP server (sidecar). ARGUS Next.js API routes proxy feed data to Phantom and relay anomaly results back. A new `"PHANTOM"` alert category integrates with the existing `analysisEngine.ts` briefing pipeline. A WebSocket stream provides real-time push for high-severity anomalies.

**Tech Stack:** Rust (Axum, ndarray, nalgebra), TypeScript (Next.js API routes), Zustand, Cesium.js entity layer

**Spec:** `PHANTOM_INTEGRATION_PLAN.md` (root of repo)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `phantom/src/main.rs` | Axum server entrypoint — routes, CORS, WS upgrade |
| `phantom/src/lib.rs` | Re-exports for library use |
| `phantom/src/chaos.rs` | Lyapunov exponent + FTLE computation on time-series windows |
| `phantom/src/flight.rs` | Flight trajectory anomaly detection (4D: lat/lon/alt/time) |
| `phantom/src/seismic.rs` | Seismic pattern anomaly detection (magnitude/depth/timing clusters) |
| `phantom/src/weather.rs` | Weather edge detection (Phase 2 — deferred, not implemented in this plan) |
| `phantom/src/types.rs` | Shared structs: `AnomalyResult`, `ChaosScore`, severity enums |
| `phantom/src/ws.rs` | WebSocket broadcast channel for real-time anomaly push |
| `argus-app/src/app/api/phantom/flight/route.ts` | Next.js proxy: POST flight data → Phantom → return anomalies |
| `argus-app/src/app/api/phantom/seismic/route.ts` | Next.js proxy: POST seismic data → Phantom → return anomalies |
| `argus-app/src/app/api/phantom/health/route.ts` | Health check for Phantom sidecar |
| `argus-app/src/lib/ingest/phantom.ts` | Client functions: `sendFlightsToPhantom()`, `sendSeismicToPhantom()` |
| `argus-app/src/lib/cesium/layers/AnomalyLayer.ts` | Cesium entity layer for rendering anomaly markers on globe |
| `phantom/Dockerfile` | Multi-stage Rust build for Pi deployment |

### Modified Files

| File | Changes |
|------|---------|
| `argus-app/src/lib/intel/analysisEngine.ts` | Add `"PHANTOM"` to `AlertCategory`, add `analyzePhantomResults()` function, update category weights |
| `argus-app/src/types/intel.ts` | Add `"phantom"` to `FeedKey`, `"anomalies"` to `LayerKey` |
| `argus-app/src/store/useArgusStore.ts` | Add `anomalies` layer toggle, `phantom` feed health, `anomalies` count |
| `argus-app/src/lib/config.ts` | Add `phantom` endpoint + poll interval |
| `argus-app/src/components/CesiumGlobe.tsx` | Add phantom polling task, phantom alerts ref, anomaly layer init |
| `argus-app/src/components/HudOverlay.tsx` | Add anomalies layer toggle in sidebar |
| `docker-compose.yml` | Add phantom service |

---

## Task 1: Phantom Rust Core — Types and Chaos Math

**Files:**
- Modify: `phantom/Cargo.toml` (already exists — verify dependencies)
- Create: `phantom/src/types.rs`
- Create: `phantom/src/chaos.rs`
- Create: `phantom/src/lib.rs`

**Note:** `phantom/Cargo.toml` already exists on the branch with all required dependencies (axum, ndarray, nalgebra, serde, tokio, chrono, tower-http, futures-util, tracing). Verify it has what we need before proceeding. Also create `phantom/src/` directory if it doesn't exist: `mkdir -p phantom/src`.

- [ ] **Step 0: Verify Cargo.toml and create src directory**

Run: `cd phantom && cat Cargo.toml | head -5 && mkdir -p src`
Expected: Shows `[package] name = "phantom"` and creates src dir

- [ ] **Step 1: Create shared types**

```rust
// phantom/src/types.rs
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

impl Severity {
    pub fn from_chaos_score(score: f64) -> Self {
        match score {
            s if s >= 0.9 => Severity::Critical,
            s if s >= 0.7 => Severity::High,
            s if s >= 0.4 => Severity::Medium,
            _ => Severity::Low,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyResult {
    pub entity_id: String,
    pub anomaly_type: String,
    pub chaos_score: f64,
    pub severity: Severity,
    pub lat: f64,
    pub lon: f64,
    pub detail: String,
    pub detected_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FlightPoint {
    pub flight_id: String,
    pub callsign: String,
    pub lat: f64,
    pub lon: f64,
    pub altitude: f64,
    pub velocity: f64,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeismicPoint {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
    pub magnitude: f64,
    pub depth_km: f64,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FlightBatch {
    pub flights: Vec<FlightPoint>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeismicBatch {
    pub events: Vec<SeismicPoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnomalyResponse {
    pub anomalies: Vec<AnomalyResult>,
    pub processing_time_ms: u64,
}
```

- [ ] **Step 2: Implement Lyapunov exponent computation**

```rust
// phantom/src/chaos.rs
use ndarray::Array1;

/// Compute the maximal Lyapunov exponent for a 1D time series.
/// Uses the Rosenstein et al. (1993) nearest-neighbor method.
/// Returns a value where >0 indicates chaos, higher = more chaotic.
pub fn lyapunov_exponent(series: &[f64], window: usize) -> f64 {
    if series.len() < window + 2 {
        return 0.0;
    }

    let data = Array1::from_vec(series.to_vec());
    let n = data.len();
    let mut divergences = Vec::new();

    for i in 0..(n - window) {
        // Find nearest neighbor (excluding temporal neighbors)
        let mut min_dist = f64::MAX;
        let mut nn_idx = 0;
        for j in 0..(n - window) {
            if (i as isize - j as isize).unsigned_abs() < window {
                continue;
            }
            let dist = (data[i] - data[j]).abs();
            if dist < min_dist && dist > 1e-10 {
                min_dist = dist;
                nn_idx = j;
            }
        }

        if min_dist < f64::MAX {
            // Track divergence over time
            let end = (i + window).min(n - 1).min(nn_idx + window).min(n - 1);
            let steps = end.saturating_sub(i.max(nn_idx));
            if steps > 0 {
                let final_dist = (data[i + steps] - data[nn_idx + steps]).abs();
                if final_dist > 1e-10 && min_dist > 1e-10 {
                    divergences.push((final_dist / min_dist).ln() / steps as f64);
                }
            }
        }
    }

    if divergences.is_empty() {
        return 0.0;
    }
    divergences.iter().sum::<f64>() / divergences.len() as f64
}

/// Normalize a Lyapunov exponent to a 0.0–1.0 chaos score.
/// Maps typical range [-0.5, 2.0] to [0, 1] with sigmoid.
pub fn chaos_score(lyapunov: f64) -> f64 {
    let scaled = (lyapunov - 0.3) * 3.0; // center around transition point
    1.0 / (1.0 + (-scaled).exp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_series_has_low_chaos() {
        // Linear ramp = perfectly predictable
        let series: Vec<f64> = (0..50).map(|i| i as f64 * 0.1).collect();
        let lyap = lyapunov_exponent(&series, 10);
        let score = chaos_score(lyap);
        assert!(score < 0.5, "stable series should have low chaos score, got {score}");
    }

    #[test]
    fn chaotic_series_has_high_chaos() {
        // Logistic map at r=3.9 (chaotic regime)
        let mut series = vec![0.1_f64];
        for i in 0..99 {
            let x = series[i];
            series.push(3.9 * x * (1.0 - x));
        }
        let lyap = lyapunov_exponent(&series, 10);
        let score = chaos_score(lyap);
        assert!(score > 0.5, "chaotic series should have high chaos score, got {score}");
    }

    #[test]
    fn short_series_returns_zero() {
        let series = vec![1.0, 2.0, 3.0];
        let lyap = lyapunov_exponent(&series, 10);
        assert_eq!(lyap, 0.0);
    }
}
```

- [ ] **Step 3: Create lib.rs re-exports**

```rust
// phantom/src/lib.rs
pub mod chaos;
pub mod types;
// Note: flight, seismic, and ws modules are added in Tasks 2, 3, and 4
// Do NOT declare them here yet — the compiler will fail on missing files
```

- [ ] **Step 4: Run tests**

Run: `cd phantom && cargo test -- chaos`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add phantom/src/types.rs phantom/src/chaos.rs phantom/src/lib.rs
git commit -m "feat(phantom): add chaos math core and shared types"
```

---

## Task 2: Flight Anomaly Detector

**Files:**
- Create: `phantom/src/flight.rs`

- [ ] **Step 1: Implement flight trajectory anomaly detection**

```rust
// phantom/src/flight.rs
use crate::chaos::{chaos_score, lyapunov_exponent};
use crate::types::{AnomalyResult, FlightPoint, Severity};
use chrono::Utc;
use std::collections::HashMap;

const WINDOW_SIZE: usize = 10;
const ANOMALY_THRESHOLD: f64 = 0.6;

/// Buffer of recent flight points per flight ID for trajectory analysis.
#[derive(Default)]
pub struct FlightAnalyzer {
    trajectories: HashMap<String, Vec<FlightPoint>>,
    max_history: usize,
}

impl FlightAnalyzer {
    pub fn new() -> Self {
        Self {
            trajectories: HashMap::new(),
            max_history: 100,
        }
    }

    /// Ingest a batch of flight points, return any anomalies detected.
    pub fn analyze(&mut self, flights: &[FlightPoint]) -> Vec<AnomalyResult> {
        let mut anomalies = Vec::new();

        for point in flights {
            let history = self
                .trajectories
                .entry(point.flight_id.clone())
                .or_default();
            history.push(point.clone());

            // Trim to max history
            if history.len() > self.max_history {
                history.drain(0..(history.len() - self.max_history));
            }

            // Need at least WINDOW_SIZE + 2 points for Lyapunov
            if history.len() < WINDOW_SIZE + 2 {
                continue;
            }

            // Compute chaos on altitude series
            let alt_series: Vec<f64> = history.iter().map(|p| p.altitude).collect();
            let lyap = lyapunov_exponent(&alt_series, WINDOW_SIZE);
            let score = chaos_score(lyap);

            if score > ANOMALY_THRESHOLD {
                let severity = Severity::from_chaos_score(score);
                anomalies.push(AnomalyResult {
                    entity_id: point.flight_id.clone(),
                    anomaly_type: "trajectory_chaos".to_string(),
                    chaos_score: score,
                    severity,
                    lat: point.lat,
                    lon: point.lon,
                    detail: format!(
                        "{} chaos score {:.2} on altitude series (λ={:.3}) — trajectory unstable",
                        point.callsign, score, lyap
                    ),
                    detected_at: Utc::now(),
                });
            }
        }

        // Prune stale flights (no update in 5 minutes = 300s)
        let now = flights.iter().map(|f| f.timestamp).fold(0.0_f64, f64::max);
        self.trajectories.retain(|_, hist| {
            hist.last().map_or(false, |p| now - p.timestamp < 300.0)
        });

        anomalies
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_point(id: &str, alt: f64, ts: f64) -> FlightPoint {
        FlightPoint {
            flight_id: id.to_string(),
            callsign: id.to_string(),
            lat: 40.0,
            lon: -74.0,
            altitude: alt,
            velocity: 250.0,
            timestamp: ts,
        }
    }

    #[test]
    fn stable_flight_no_anomaly() {
        let mut analyzer = FlightAnalyzer::new();
        // Steady climb
        let flights: Vec<FlightPoint> = (0..20)
            .map(|i| make_point("AAL100", 10000.0 + i as f64 * 100.0, i as f64))
            .collect();
        let anomalies = analyzer.analyze(&flights);
        assert!(anomalies.is_empty(), "steady climb should produce no anomalies");
    }

    #[test]
    fn erratic_flight_produces_anomaly() {
        let mut analyzer = FlightAnalyzer::new();
        // Logistic-map altitude (chaotic)
        let mut alts = vec![0.1_f64];
        for i in 0..29 {
            alts.push(3.9 * alts[i] * (1.0 - alts[i]));
        }
        let flights: Vec<FlightPoint> = alts
            .iter()
            .enumerate()
            .map(|(i, &a)| make_point("CHAOS1", a * 10000.0, i as f64))
            .collect();
        let anomalies = analyzer.analyze(&flights);
        assert!(!anomalies.is_empty(), "chaotic altitude should trigger anomaly");
        assert!(anomalies[0].chaos_score > ANOMALY_THRESHOLD);
    }
}
```

- [ ] **Step 2: Add flight module to lib.rs**

Add `pub mod flight;` to `phantom/src/lib.rs`.

- [ ] **Step 3: Run tests**

Run: `cd phantom && cargo test -- flight`
Expected: 2 tests pass

- [ ] **Step 4: Commit**

```bash
git add phantom/src/flight.rs phantom/src/lib.rs
git commit -m "feat(phantom): add flight trajectory anomaly detector"
```

---

## Task 3: Seismic Anomaly Detector

**Files:**
- Create: `phantom/src/seismic.rs`

- [ ] **Step 1: Implement seismic pattern anomaly detection**

```rust
// phantom/src/seismic.rs
use crate::chaos::{chaos_score, lyapunov_exponent};
use crate::types::{AnomalyResult, SeismicPoint, Severity};
use chrono::Utc;

const WINDOW_SIZE: usize = 8;
const ANOMALY_THRESHOLD: f64 = 0.5;
const CLUSTER_RADIUS_DEG: f64 = 2.0; // ~220km at equator

/// Detect anomalous seismic patterns: magnitude chaos, spatial clustering.
pub fn analyze_seismic(events: &[SeismicPoint]) -> Vec<AnomalyResult> {
    let mut anomalies = Vec::new();

    if events.len() < WINDOW_SIZE + 2 {
        return anomalies;
    }

    // Sort by timestamp for time-series analysis
    let mut sorted = events.to_vec();
    sorted.sort_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

    // Magnitude series chaos
    let mag_series: Vec<f64> = sorted.iter().map(|e| e.magnitude).collect();
    let lyap = lyapunov_exponent(&mag_series, WINDOW_SIZE);
    let score = chaos_score(lyap);

    if score > ANOMALY_THRESHOLD {
        // Find centroid of recent events
        let recent = &sorted[sorted.len().saturating_sub(5)..];
        let avg_lat = recent.iter().map(|e| e.lat).sum::<f64>() / recent.len() as f64;
        let avg_lon = recent.iter().map(|e| e.lon).sum::<f64>() / recent.len() as f64;

        anomalies.push(AnomalyResult {
            entity_id: "seismic-pattern".to_string(),
            anomaly_type: "magnitude_chaos".to_string(),
            chaos_score: score,
            severity: Severity::from_chaos_score(score),
            lat: avg_lat,
            lon: avg_lon,
            detail: format!(
                "Seismic magnitude series chaos score {:.2} (λ={:.3}) over {} events — pattern instability detected",
                score, lyap, sorted.len()
            ),
            detected_at: Utc::now(),
        });
    }

    // Spatial clustering: find dense clusters
    for i in 0..sorted.len() {
        let cluster: Vec<&SeismicPoint> = sorted
            .iter()
            .filter(|e| {
                (e.lat - sorted[i].lat).abs() < CLUSTER_RADIUS_DEG
                    && (e.lon - sorted[i].lon).abs() < CLUSTER_RADIUS_DEG
            })
            .collect();

        if cluster.len() >= 5 {
            let depths: Vec<f64> = cluster.iter().map(|e| e.depth_km).collect();
            let depth_lyap = lyapunov_exponent(&depths, depths.len().min(WINDOW_SIZE));
            let depth_score = chaos_score(depth_lyap);

            if depth_score > ANOMALY_THRESHOLD {
                anomalies.push(AnomalyResult {
                    entity_id: format!("cluster-{}", sorted[i].id),
                    anomaly_type: "depth_cluster_chaos".to_string(),
                    chaos_score: depth_score,
                    severity: Severity::from_chaos_score(depth_score),
                    lat: sorted[i].lat,
                    lon: sorted[i].lon,
                    detail: format!(
                        "Seismic cluster ({} events within {}°) depth chaos {:.2} — unusual depth variation pattern",
                        cluster.len(), CLUSTER_RADIUS_DEG, depth_score
                    ),
                    detected_at: Utc::now(),
                });
                break; // One cluster alert per batch
            }
        }
    }

    anomalies
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_quake(id: &str, mag: f64, lat: f64, lon: f64, ts: f64) -> SeismicPoint {
        SeismicPoint {
            id: id.to_string(),
            lat,
            lon,
            magnitude: mag,
            depth_km: 10.0,
            timestamp: ts,
        }
    }

    #[test]
    fn few_events_no_anomaly() {
        let events: Vec<SeismicPoint> = (0..3)
            .map(|i| make_quake(&format!("q{i}"), 2.0 + i as f64 * 0.1, 35.0, -118.0, i as f64))
            .collect();
        let anomalies = analyze_seismic(&events);
        assert!(anomalies.is_empty());
    }

    #[test]
    fn steady_magnitudes_low_chaos() {
        let events: Vec<SeismicPoint> = (0..20)
            .map(|i| make_quake(&format!("q{i}"), 3.0, 35.0, -118.0, i as f64))
            .collect();
        let anomalies = analyze_seismic(&events);
        // Constant magnitude = no chaos
        let mag_anomalies: Vec<_> = anomalies.iter().filter(|a| a.anomaly_type == "magnitude_chaos").collect();
        assert!(mag_anomalies.is_empty());
    }
}
```

- [ ] **Step 2: Add seismic module to lib.rs**

Add `pub mod seismic;` to `phantom/src/lib.rs`.

- [ ] **Step 3: Run tests**

Run: `cd phantom && cargo test -- seismic`
Expected: 2 tests pass

- [ ] **Step 4: Commit**

```bash
git add phantom/src/seismic.rs phantom/src/lib.rs
git commit -m "feat(phantom): add seismic pattern anomaly detector"
```

---

## Task 4: WebSocket Broadcast and Axum Server

**Files:**
- Create: `phantom/src/ws.rs`
- Create: `phantom/src/main.rs`

- [ ] **Step 1: Implement WebSocket broadcast channel**

```rust
// phantom/src/ws.rs
use crate::types::AnomalyResult;
use tokio::sync::broadcast;

pub type AnomalyTx = broadcast::Sender<Vec<AnomalyResult>>;
pub type AnomalyRx = broadcast::Receiver<Vec<AnomalyResult>>;

pub fn anomaly_channel(capacity: usize) -> (AnomalyTx, AnomalyRx) {
    broadcast::channel(capacity)
}
```

- [ ] **Step 2: Add ws module to lib.rs**

Add `pub mod ws;` to `phantom/src/lib.rs`. After this, lib.rs should have: `pub mod chaos; pub mod types; pub mod flight; pub mod seismic; pub mod ws;`

- [ ] **Step 3: Implement Axum server with REST + WS endpoints**

```rust
// phantom/src/main.rs
use axum::{
    extract::{State, WebSocketUpgrade, ws::{Message, WebSocket}},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use phantom::{
    flight::FlightAnalyzer,
    seismic::analyze_seismic,
    types::{AnomalyResponse, FlightBatch, SeismicBatch},
    ws::{anomaly_channel, AnomalyTx},
};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use futures_util::{SinkExt, StreamExt};

struct AppState {
    flight_analyzer: Mutex<FlightAnalyzer>,
    anomaly_tx: AnomalyTx,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "phantom=info".into()),
        )
        .init();

    let (tx, _rx) = anomaly_channel(64);
    let state = Arc::new(AppState {
        flight_analyzer: Mutex::new(FlightAnalyzer::new()),
        anomaly_tx: tx,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/anomalies/flight", post(analyze_flights))
        .route("/api/anomalies/seismic", post(analyze_seismic_handler))
        .route("/ws/anomalies/realtime", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = std::env::var("PHANTOM_ADDR").unwrap_or_else(|_| "0.0.0.0:7700".to_string());
    tracing::info!("Phantom listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

async fn analyze_flights(
    State(state): State<Arc<AppState>>,
    Json(batch): Json<FlightBatch>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let mut analyzer = state.flight_analyzer.lock().await;
    let anomalies = analyzer.analyze(&batch.flights);
    let elapsed = start.elapsed().as_millis() as u64;

    // Broadcast to WS subscribers
    if !anomalies.is_empty() {
        let _ = state.anomaly_tx.send(anomalies.clone());
    }

    Json(AnomalyResponse {
        anomalies,
        processing_time_ms: elapsed,
    })
}

async fn analyze_seismic_handler(
    State(state): State<Arc<AppState>>,
    Json(batch): Json<SeismicBatch>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();
    let anomalies = analyze_seismic(&batch.events);
    let elapsed = start.elapsed().as_millis() as u64;

    if !anomalies.is_empty() {
        let _ = state.anomaly_tx.send(anomalies.clone());
    }

    Json(AnomalyResponse {
        anomalies,
        processing_time_ms: elapsed,
    })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.anomaly_tx.subscribe();

    let send_task = tokio::spawn(async move {
        while let Ok(anomalies) = rx.recv().await {
            let json = serde_json::to_string(&anomalies).unwrap_or_default();
            if sender.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Keep alive — read and discard client messages
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {}
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd phantom && cargo build 2>&1 | tail -5`
Expected: Compiles (may have warnings, no errors)

- [ ] **Step 5: Commit Cargo.lock too (binary crate — lock file should be tracked)**

```bash
git add phantom/src/ws.rs phantom/src/main.rs phantom/src/lib.rs phantom/Cargo.lock
git commit -m "feat(phantom): add Axum HTTP/WS server with flight and seismic endpoints"
```

---

## Task 5: ARGUS Type System Updates

**Files:**
- Modify: `argus-app/src/types/intel.ts:1-12` (add phantom to FeedKey and LayerKey)
- Modify: `argus-app/src/lib/intel/analysisEngine.ts:8` (add PHANTOM category)
- Modify: `argus-app/src/lib/intel/analysisEngine.ts:408-416` (add category weight)

- [ ] **Step 1: Add `"phantom"` to FeedKey and `"anomalies"` to LayerKey**

In `argus-app/src/types/intel.ts`, update:

```typescript
// LayerKey — add "anomalies"
export type LayerKey =
  | "flights"
  | "military"
  | "satellites"
  | "satelliteLinks"
  | "seismic"
  | "bases"
  | "outages"
  | "threats"
  | "gdelt"
  | "anomalies";

// FeedKey — add "phantom"
export type FeedKey = "opensky" | "celestrak" | "usgs" | "adsb" | "cfradar" | "otx" | "fred" | "ais" | "gdelt" | "threatradar" | "phantom";
```

- [ ] **Step 2: Add `"PHANTOM"` to AlertCategory in analysisEngine.ts**

In `argus-app/src/lib/intel/analysisEngine.ts`, update line 8:

```typescript
export type AlertCategory = "FLIGHT" | "MILITARY" | "SATELLITE" | "SEISMIC" | "CAMERA" | "PHANTOM";
```

Update category weight inside `generateBriefing()` — add `PHANTOM: 1.3` to the existing `categoryWeight` object (it's a local variable, not module-level):

```typescript
    PHANTOM: 1.3, // Chaos-detected anomalies get elevated weight
```

- [ ] **Step 3: Add `analyzePhantomResults()` function to analysisEngine.ts**

Add before `generateBriefing`:

```typescript
// ---------------------------------------------------------------------------
// Phantom Anomaly Analysis
// ---------------------------------------------------------------------------

export interface PhantomAnomaly {
  entity_id: string;
  anomaly_type: string;
  chaos_score: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  lat: number;
  lon: number;
  detail: string;
  detected_at: string;
}

const PHANTOM_SEVERITY_MAP: Record<string, AlertSeverity> = {
  Critical: "CRITICAL",
  High: "WARNING",
  Medium: "WARNING",
  Low: "INFO",
};

export function analyzePhantomResults(anomalies: PhantomAnomaly[]): IntelAlert[] {
  const now = Date.now();
  return anomalies.map((a) => ({
    id: nextAlertId(),
    severity: PHANTOM_SEVERITY_MAP[a.severity] ?? "INFO",
    category: "PHANTOM" as AlertCategory,
    title: `CHAOS ANOMALY — ${a.anomaly_type.toUpperCase().replace(/_/g, " ")}`,
    detail: a.detail,
    timestamp: now,
    coordinates: { lat: a.lat, lon: a.lon },
    entityId: a.entity_id,
  }));
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors for store (LayerKey/FeedKey mismatch) — will fix in Task 6

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/types/intel.ts argus-app/src/lib/intel/analysisEngine.ts
git commit -m "feat(types): add PHANTOM alert category and anomaly analysis function"
```

---

## Task 6: Store and Config Updates

**Files:**
- Modify: `argus-app/src/store/useArgusStore.ts` (add anomalies layer, phantom feed health, anomalies count)
- Modify: `argus-app/src/lib/config.ts` (add phantom endpoint + poll interval)

- [ ] **Step 1: Update config.ts**

Add to `endpoints`:
```typescript
phantom: process.env.NEXT_PUBLIC_PHANTOM_ENDPOINT ?? "http://localhost:7700",
```

Add to `pollMs`:
```typescript
phantom: 10_000, // Match flight polling cadence
```

- [ ] **Step 2: Update store — add `anomalies` layer, `phantom` feed, `anomalies` count**

In `useArgusStore.ts`, add `anomalies: true` to `layers` default, `anomalies: 0` to `counts`, `phantom: emptyFeed()` to `feedHealth`, and add `"anomalies"` to the `setCount` key union.

- [ ] **Step 3: Verify full type check passes**

Run: `cd argus-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/store/useArgusStore.ts argus-app/src/lib/config.ts
git commit -m "feat(config): add phantom endpoint, polling interval, and store state"
```

---

## Task 7: Phantom Ingest Client

**Files:**
- Create: `argus-app/src/lib/ingest/phantom.ts`

- [ ] **Step 1: Create Phantom client functions**

```typescript
// argus-app/src/lib/ingest/phantom.ts
import type { TrackedFlight, EarthquakeFeature } from "@/types/intel";
import type { PhantomAnomaly } from "@/lib/intel/analysisEngine";

interface PhantomAnomalyResponse {
  anomalies: PhantomAnomaly[];
  processing_time_ms: number;
}

export async function sendFlightsToPhantom(
  phantomUrl: string,
  flights: TrackedFlight[],
): Promise<PhantomAnomaly[]> {
  const body = {
    flights: flights.map((f) => ({
      flight_id: f.id,
      callsign: f.callsign,
      lat: f.latitude,
      lon: f.longitude,
      altitude: f.altitudeMeters,
      velocity: f.velocity,
      timestamp: Date.now() / 1000,
    })),
  };

  const res = await fetch(`${phantomUrl}/api/anomalies/flight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Phantom flight: ${res.status}`);
  const data: PhantomAnomalyResponse = await res.json();
  return data.anomalies;
}

export async function sendSeismicToPhantom(
  phantomUrl: string,
  quakes: EarthquakeFeature[],
): Promise<PhantomAnomaly[]> {
  const body = {
    events: quakes.map((q) => ({
      id: q.id,
      lat: q.latitude,
      lon: q.longitude,
      magnitude: q.magnitude,
      depth_km: q.depthKm,
      timestamp: q.timestamp / 1000,
    })),
  };

  const res = await fetch(`${phantomUrl}/api/anomalies/seismic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Phantom seismic: ${res.status}`);
  const data: PhantomAnomalyResponse = await res.json();
  return data.anomalies;
}

export async function checkPhantomHealth(phantomUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${phantomUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify types**

Run: `cd argus-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/lib/ingest/phantom.ts
git commit -m "feat(ingest): add Phantom client for flight and seismic anomaly detection"
```

---

## Task 8: Next.js API Proxy Routes

**Files:**
- Create: `argus-app/src/app/api/phantom/flight/route.ts`
- Create: `argus-app/src/app/api/phantom/seismic/route.ts`
- Create: `argus-app/src/app/api/phantom/health/route.ts`

- [ ] **Step 1: Create flight anomaly proxy route**

```typescript
// argus-app/src/app/api/phantom/flight/route.ts
import { NextResponse } from "next/server";
import { ARGUS_CONFIG } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(
      `${ARGUS_CONFIG.endpoints.phantom}/api/anomalies/flight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ error: "Phantom unavailable" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Phantom connection failed" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create seismic anomaly proxy route**

```typescript
// argus-app/src/app/api/phantom/seismic/route.ts
import { NextResponse } from "next/server";
import { ARGUS_CONFIG } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(
      `${ARGUS_CONFIG.endpoints.phantom}/api/anomalies/seismic`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ error: "Phantom unavailable" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Phantom connection failed" }, { status: 502 });
  }
}
```

- [ ] **Step 3: Create health check route**

```typescript
// argus-app/src/app/api/phantom/health/route.ts
import { NextResponse } from "next/server";
import { ARGUS_CONFIG } from "@/lib/config";

export async function GET() {
  try {
    const res = await fetch(`${ARGUS_CONFIG.endpoints.phantom}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return NextResponse.json({ status: res.ok ? "up" : "down" });
  } catch {
    return NextResponse.json({ status: "down" });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd argus-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add argus-app/src/app/api/phantom/
git commit -m "feat(api): add Phantom proxy routes for flight, seismic, and health"
```

---

## Task 9: Wire Phantom into CesiumGlobe Polling Loop

**Files:**
- Modify: `argus-app/src/components/CesiumGlobe.tsx`

This is the critical integration point. We add:
1. A `phantomAlertsRef` alongside existing alert refs
2. Phantom calls inside the opensky and usgs pollers (fire-and-forget, non-blocking)
3. Include phantom alerts in the briefing generation interval

- [ ] **Step 1: Add imports at top of CesiumGlobe.tsx**

Add to existing imports:
```typescript
import { sendFlightsToPhantom, sendSeismicToPhantom } from "@/lib/ingest/phantom";
import { analyzePhantomResults } from "@/lib/intel/analysisEngine";
```

- [ ] **Step 2: Add phantomAlertsRef alongside other alert refs**

Find the block where `flightAlertsRef`, `militaryAlertsRef`, etc. are declared. Add:
```typescript
const phantomAlertsRef = useRef<IntelAlert[]>([]);
```

- [ ] **Step 3: Add Phantom call inside the opensky poller (after `recordFlights`)**

Inside the `opensky` poller's try block, after `recordFlights(bounded)`, add:

```typescript
          // Phantom anomaly detection (non-blocking)
          sendFlightsToPhantom(ARGUS_CONFIG.endpoints.phantom, bounded)
            .then((anomalies) => {
              if (anomalies.length > 0) {
                phantomAlertsRef.current = [
                  ...phantomAlertsRef.current.filter(
                    (a) => Date.now() - a.timestamp < 60_000,
                  ),
                  ...analyzePhantomResults(anomalies),
                ];
                setFeedHealthy("phantom");
              }
            })
            .catch(() => {
              // Phantom is optional — don't set feed error on every miss
            });
```

- [ ] **Step 4: Add Phantom call inside the usgs poller (after `recordQuakes`)**

Inside the `usgs` poller's try block, after `recordQuakes(quakes)`, add:

```typescript
          // Phantom seismic anomaly detection (non-blocking)
          sendSeismicToPhantom(ARGUS_CONFIG.endpoints.phantom, quakes)
            .then((anomalies) => {
              if (anomalies.length > 0) {
                phantomAlertsRef.current = [
                  ...phantomAlertsRef.current.filter(
                    (a) => Date.now() - a.timestamp < 300_000,
                  ),
                  ...analyzePhantomResults(anomalies),
                ];
                setFeedHealthy("phantom");
              }
            })
            .catch(() => {});
```

- [ ] **Step 5: Include phantom alerts in briefing generation**

Update the briefing interval (around line 1263) to include phantom alerts:

```typescript
      const allAlerts = [
        ...flightAlertsRef.current,
        ...militaryAlertsRef.current,
        ...satelliteAlertsRef.current,
        ...seismicAlertsRef.current,
        ...phantomAlertsRef.current,
      ];
```

- [ ] **Step 6: Verify build**

Run: `cd argus-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat(globe): wire Phantom anomaly detection into polling loop and briefing"
```

---

## Task 10: HUD Layer Toggle

**Files:**
- Modify: `argus-app/src/components/HudOverlay.tsx`

- [ ] **Step 1: Add anomalies toggle to the layer controls**

Find the layer toggle section in HudOverlay.tsx. Add an "Anomalies" toggle alongside the existing layer toggles, using the same pattern as the other layers:

```typescript
// Add to the layer toggle list, following existing pattern:
{ key: "anomalies" as LayerKey, label: "Anomalies", icon: "⚠" }
```

- [ ] **Step 2: Verify build**

Run: `cd argus-app && npx next build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add argus-app/src/components/HudOverlay.tsx
git commit -m "feat(hud): add anomalies layer toggle to sidebar"
```

---

## Task 11: Anomaly Layer — Cesium Globe Rendering

**Files:**
- Create: `argus-app/src/lib/cesium/layers/AnomalyLayer.ts`
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (init layer, feed anomaly data)

- [ ] **Step 1: Create AnomalyLayer class**

Follow the same pattern as existing layers (e.g., `ThreatLayer`, `OutageLayer`). The layer renders color-coded point entities for each active anomaly:

```typescript
// argus-app/src/lib/cesium/layers/AnomalyLayer.ts
import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  NearFarScalar,
  VerticalOrigin,
} from "cesium";
import type { PhantomAnomaly } from "@/lib/intel/analysisEngine";

const SEVERITY_COLORS: Record<string, Color> = {
  Critical: Color.RED,
  High: Color.ORANGE,
  Medium: Color.YELLOW,
  Low: Color.CYAN,
};

export class AnomalyLayer {
  private viewer: Viewer;
  private entities = new Map<string, Entity>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  update(anomalies: PhantomAnomaly[]): number {
    const activeIds = new Set(anomalies.map((a) => `anomaly-${a.entity_id}`));

    // Remove stale
    for (const [id, entity] of this.entities) {
      if (!activeIds.has(id)) {
        this.viewer.entities.remove(entity);
        this.entities.delete(id);
      }
    }

    // Upsert
    for (const anomaly of anomalies) {
      const id = `anomaly-${anomaly.entity_id}`;
      const color = SEVERITY_COLORS[anomaly.severity] ?? Color.WHITE;

      if (this.entities.has(id)) continue;

      const entity = this.viewer.entities.add({
        id,
        position: Cartesian3.fromDegrees(anomaly.lon, anomaly.lat, 0),
        point: {
          pixelSize: 12,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          scaleByDistance: new NearFarScalar(1e3, 1.5, 1e7, 0.5),
        },
        label: {
          text: `⚠ ${anomaly.anomaly_type}`,
          font: "11px monospace",
          fillColor: color,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -16),
          scaleByDistance: new NearFarScalar(1e3, 1.0, 5e6, 0.3),
        },
      });
      this.entities.set(id, entity);
    }

    return this.entities.size;
  }

  clear(): void {
    for (const entity of this.entities.values()) {
      this.viewer.entities.remove(entity);
    }
    this.entities.clear();
  }
}
```

**Note:** Add `import { Cartesian2 } from "cesium";` to the imports if not already covered.

- [ ] **Step 2: Wire AnomalyLayer into CesiumGlobe.tsx**

In the viewer initialization section of CesiumGlobe.tsx, instantiate `AnomalyLayer` alongside other layers. Store a ref and call `anomalyLayer.update(...)` when phantom results arrive. Also respect the `anomalies` layer toggle from the store.

- [ ] **Step 3: Verify build**

Run: `cd argus-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add argus-app/src/lib/cesium/layers/AnomalyLayer.ts argus-app/src/components/CesiumGlobe.tsx
git commit -m "feat(globe): add AnomalyLayer for rendering Phantom chaos detections"
```

---

## Task 12: Phantom Dockerfile

**Files:**
- Create: `phantom/Dockerfile`
- Modify: `docker-compose.yml` (if it exists, add phantom service)

- [ ] **Step 1: Create multi-stage Dockerfile for Phantom**

```dockerfile
# phantom/Dockerfile
FROM rust:1.82-slim-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Create dummy src for dependency caching
RUN mkdir src && echo "fn main(){}" > src/main.rs && echo "" > src/lib.rs
RUN cargo build --release 2>/dev/null || true
# Now copy real source
COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/phantom /usr/local/bin/phantom
ENV PHANTOM_ADDR=0.0.0.0:7700
EXPOSE 7700
CMD ["phantom"]
```

- [ ] **Step 2: Add phantom service to docker-compose.yml**

If `docker-compose.yml` exists, add:
```yaml
  phantom:
    build: ./phantom
    ports:
      - "7700:7700"
    environment:
      - PHANTOM_ADDR=0.0.0.0:7700
      - RUST_LOG=phantom=info
    restart: unless-stopped
```

- [ ] **Step 3: Commit**

```bash
git add phantom/Dockerfile docker-compose.yml
git commit -m "infra(phantom): add Dockerfile and docker-compose service"
```

---

## Task 13: Integration Test — End-to-End Smoke Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Build and start Phantom**

Run: `cd phantom && cargo build --release && RUST_LOG=phantom=info ./target/release/phantom &`
Expected: "Phantom listening on 0.0.0.0:7700"

- [ ] **Step 2: Health check**

Run: `curl http://localhost:7700/health`
Expected: `ok`

- [ ] **Step 3: Test flight anomaly endpoint**

Run:
```bash
curl -s -X POST http://localhost:7700/api/anomalies/flight \
  -H 'Content-Type: application/json' \
  -d '{"flights":[{"flight_id":"TEST1","callsign":"TEST1","lat":40.0,"lon":-74.0,"altitude":10000,"velocity":250,"timestamp":1}]}' | python3 -m json.tool
```
Expected: `{"anomalies":[],"processing_time_ms":0}` (single point = no anomaly, need window)

- [ ] **Step 4: Build ARGUS**

Run: `cd argus-app && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 5: Stop Phantom background process**

Run: `kill %1 2>/dev/null || true`

- [ ] **Step 6: Final commit (if any unstaged fixes)**

```bash
git status
# Only add specific files if there are remaining changes — do NOT use git add -A
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Chaos math core | 3 Rust files |
| 2 | Flight detector | 1 Rust file |
| 3 | Seismic detector | 1 Rust file |
| 4 | Axum server | 2 Rust files |
| 5 | Type system | 2 TS files |
| 6 | Store + config | 2 TS files |
| 7 | Ingest client | 1 TS file |
| 8 | API proxy routes | 3 TS files |
| 9 | Polling integration | 1 TS file |
| 10 | HUD toggle | 1 TS file |
| 11 | Anomaly layer | 1 TS file |
| 12 | Docker | 2 files |
| 13 | Smoke test | 0 files |

---

## Deferred to Phase 2+

The following items from `PHANTOM_INTEGRATION_PLAN.md` are **intentionally deferred** until Phase 1 is validated with live data:

- **`POST /api/anomalies/weather`** — Weather edge detection (Phase 2). `phantom/src/weather.rs` is listed in the file structure but not implemented in this plan.
- **`GET /api/anomalies/history`** — Historical anomaly queries. Requires PostGIS schema + insertion logic. Deferred until we confirm the real-time pipeline works.
- **PostGIS anomaly storage** — Database schema from the spec (anomalies table, anomaly_streams table). Deferred with the history endpoint.
- **Trading signal bridge** — Kalshi/Polymarket auto-execute (Phase 3).
- **`chaos_score` vs spec's `chaoScore`** — The plan uses snake_case consistently across Rust and TypeScript. The spec used camelCase `chaoScore`. This is an intentional deviation for consistency; Serde serializes snake_case by default.

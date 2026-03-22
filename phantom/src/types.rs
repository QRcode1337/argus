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

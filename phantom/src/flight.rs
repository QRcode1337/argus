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
        let flights: Vec<FlightPoint> = (0..20)
            .map(|i| make_point("AAL100", 10000.0 + i as f64 * 100.0, i as f64))
            .collect();
        let anomalies = analyzer.analyze(&flights);
        assert!(anomalies.is_empty(), "steady climb should produce no anomalies");
    }

    #[test]
    fn erratic_flight_produces_anomaly() {
        let mut analyzer = FlightAnalyzer::new();
        // Use r=4.0 (full chaos) and 100 points to ensure strong signal
        let mut alts = vec![0.1_f64];
        for i in 0..99 {
            alts.push(4.0 * alts[i] * (1.0 - alts[i]));
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

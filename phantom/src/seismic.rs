use crate::chaos::{chaos_score, lyapunov_exponent};
use crate::types::{AnomalyResult, SeismicPoint, Severity};
use chrono::Utc;

const WINDOW_SIZE: usize = 8;
const ANOMALY_THRESHOLD: f64 = 0.5;
const CLUSTER_RADIUS_DEG: f64 = 2.0;

/// Detect anomalous seismic patterns: magnitude chaos, spatial clustering.
pub fn analyze_seismic(events: &[SeismicPoint]) -> Vec<AnomalyResult> {
    let mut anomalies = Vec::new();

    if events.len() < WINDOW_SIZE + 2 {
        return anomalies;
    }

    let mut sorted = events.to_vec();
    sorted.sort_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

    // Magnitude series chaos
    let mag_series: Vec<f64> = sorted.iter().map(|e| e.magnitude).collect();
    let lyap = lyapunov_exponent(&mag_series, WINDOW_SIZE);
    let score = chaos_score(lyap);

    if score > ANOMALY_THRESHOLD {
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

    // Spatial clustering
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
                break;
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
        let mag_anomalies: Vec<_> = anomalies
            .iter()
            .filter(|a| a.anomaly_type == "magnitude_chaos")
            .collect();
        assert!(mag_anomalies.is_empty());
    }
}

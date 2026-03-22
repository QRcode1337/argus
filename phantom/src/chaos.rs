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

    // Minimum temporal separation to avoid correlated neighbors
    let mean_period = (window / 2).max(1);

    for i in 0..(n - window) {
        // Find nearest neighbor (excluding temporal neighbors)
        let mut min_dist = f64::MAX;
        let mut nn_idx = 0;
        for j in 0..(n - window) {
            if (i as isize - j as isize).unsigned_abs() < mean_period {
                continue;
            }
            let dist = (data[i] - data[j]).abs();
            if dist < min_dist && dist > 1e-10 {
                min_dist = dist;
                nn_idx = j;
            }
        }

        if min_dist < f64::MAX {
            // Track divergence: how fast do initially close trajectories separate?
            // Measure at each step k and average the log divergence rate
            let max_k = window.min(n - 1 - i).min(n - 1 - nn_idx);
            if max_k > 0 {
                let final_dist = (data[i + max_k] - data[nn_idx + max_k]).abs();
                if final_dist > 1e-10 && min_dist > 1e-10 {
                    divergences.push((final_dist / min_dist).ln() / max_k as f64);
                }
            }
        }
    }

    if divergences.is_empty() {
        return 0.0;
    }
    divergences.iter().sum::<f64>() / divergences.len() as f64
}

/// Normalize a Lyapunov exponent to a 0.0-1.0 chaos score.
/// Maps typical range [-0.5, 2.0] to [0, 1] with sigmoid.
pub fn chaos_score(lyapunov: f64) -> f64 {
    let scaled = (lyapunov - 0.3) * 3.0;
    1.0 / (1.0 + (-scaled).exp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_series_has_low_chaos() {
        let series: Vec<f64> = (0..50).map(|i| i as f64 * 0.1).collect();
        let lyap = lyapunov_exponent(&series, 10);
        let score = chaos_score(lyap);
        assert!(score < 0.5, "stable series should have low chaos score, got {score}");
    }

    #[test]
    fn chaotic_series_has_high_chaos() {
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

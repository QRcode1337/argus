use crate::types::AnomalyResult;
use tokio::sync::broadcast;

pub type AnomalyTx = broadcast::Sender<Vec<AnomalyResult>>;
pub type AnomalyRx = broadcast::Receiver<Vec<AnomalyResult>>;

pub fn anomaly_channel(capacity: usize) -> (AnomalyTx, AnomalyRx) {
    broadcast::channel(capacity)
}

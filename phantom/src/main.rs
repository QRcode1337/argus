use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
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

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {}
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}

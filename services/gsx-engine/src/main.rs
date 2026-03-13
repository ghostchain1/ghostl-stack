//! GSX — GhostChain Sovereign Exchange Matching Engine
//!
//! High-throughput, deterministic order book matching engine for
//! institutional sovereign markets (governments, central banks, sovereign funds).
//!
//! Architecture:
//!   Institution clients → REST API → Order Validator → Matching Engine → Settlement Layer → GhostChain L1

mod order;
mod orderbook;
mod matcher;
mod trade;
mod engine;

use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use tracing::{info, error};
use tracing_subscriber::EnvFilter;

use order::{Order, OrderType, Side};
use engine::Engine;

type AppState = Arc<Engine>;

// ─── Request / Response DTOs ──────────────────────────────────────

#[derive(Deserialize)]
struct SubmitOrderRequest {
    id:               String,
    institution:      String,
    market:           String,
    side:             Side,
    order_type:       OrderType,
    price:            u64,
    quantity:         u64,
    client_ref:       Option<String>,
    compliance_token: Option<String>,
}

#[derive(Serialize)]
struct SubmitOrderResponse {
    order:  Order,
    trades: Vec<trade::Trade>,
}

#[derive(Serialize)]
struct MarketDepthResponse {
    market: String,
    bids:   Vec<(u64, u64)>,
    asks:   Vec<(u64, u64)>,
}

#[derive(Serialize)]
struct MarketsResponse {
    markets: Vec<String>,
}

#[derive(Serialize)]
struct FlushResponse {
    flushed: bool,
    batch:   Option<trade::TradeBatch>,
}

#[derive(Serialize)]
struct BatchesResponse {
    batches: Vec<trade::TradeBatch>,
}

#[derive(Serialize)]
struct HealthResponse {
    status:        &'static str,
    markets_count: usize,
    pending_trades: usize,
}

// ─── Handlers ─────────────────────────────────────────────────────

async fn health(State(engine): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status:         "ok",
        markets_count:  engine.markets().len(),
        pending_trades: engine.pending_count(),
    })
}

async fn list_markets(State(engine): State<AppState>) -> Json<MarketsResponse> {
    let mut markets = engine.markets();
    markets.sort();
    Json(MarketsResponse { markets })
}

async fn submit_order(
    State(engine): State<AppState>,
    Json(req): Json<SubmitOrderRequest>,
) -> Result<Json<SubmitOrderResponse>, StatusCode> {
    // Basic validation
    if req.institution.is_empty() || req.market.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if req.quantity == 0 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    let mut order = Order::new(
        req.id,
        req.institution,
        req.market,
        req.side,
        req.order_type,
        req.price,
        req.quantity,
    );
    order.client_ref       = req.client_ref;
    order.compliance_token = req.compliance_token;

    let (final_order, trades) = engine.submit_order(order);
    info!("Order {} → {} trade(s)", final_order.id, trades.len());

    Ok(Json(SubmitOrderResponse { order: final_order, trades }))
}

async fn cancel_order(
    State(engine): State<AppState>,
    Path((market, order_id)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    let cancelled = engine.cancel_order(&market, &order_id);
    Json(serde_json::json!({ "cancelled": cancelled, "order_id": order_id }))
}

async fn market_depth(
    State(engine): State<AppState>,
    Path(market): Path<String>,
) -> Result<Json<MarketDepthResponse>, StatusCode> {
    match engine.market_depth(&market) {
        Some((bids, asks)) => Ok(Json(MarketDepthResponse { market, bids, asks })),
        None               => Err(StatusCode::NOT_FOUND),
    }
}

async fn flush_batch(State(engine): State<AppState>) -> Json<FlushResponse> {
    let batch = engine.flush_batch();
    Json(FlushResponse { flushed: batch.is_some(), batch })
}

async fn recent_batches(State(engine): State<AppState>) -> Json<BatchesResponse> {
    Json(BatchesResponse { batches: engine.recent_batches(20) })
}

// ─── Main ─────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    // Initialize structured logging.
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_target(false)
        .compact()
        .init();

    let port = std::env::var("PORT").unwrap_or_else(|_| "8090".to_owned());
    let addr = format!("0.0.0.0:{}", port);

    let engine = Arc::new(Engine::new());
    info!("GSX Matching Engine starting on {}", addr);
    info!("Markets: {:?}", engine.markets());

    let app = Router::new()
        .route("/health",                         get(health))
        .route("/markets",                        get(list_markets))
        .route("/orders",                         post(submit_order))
        .route("/orders/:market/:order_id",       delete(cancel_order))
        .route("/depth/:market",                  get(market_depth))
        .route("/settlement/flush",               post(flush_batch))
        .route("/settlement/batches",             get(recent_batches))
        .with_state(engine);

    let listener = tokio::net::TcpListener::bind(&addr).await
        .unwrap_or_else(|e| { error!("Failed to bind {}: {}", addr, e); std::process::exit(1); });

    info!("GSX Engine ready — accepting institutional orders");
    axum::serve(listener, app).await.unwrap();
}

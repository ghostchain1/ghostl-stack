use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// A matched trade produced by the matching engine.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trade {
    /// Unique trade ID.
    pub id: String,
    /// Market where the trade occurred.
    pub market: String,
    /// Execution price (micro-units).
    pub price: u64,
    /// Quantity traded.
    pub quantity: u64,
    /// Notional value = price * quantity / 1_000_000.
    pub notional: u64,
    /// Buyer order ID.
    pub buyer_order_id: String,
    /// Seller order ID.
    pub seller_order_id: String,
    /// GNS identity of the buyer.
    pub buyer: String,
    /// GNS identity of the seller.
    pub seller: String,
    /// Trade execution timestamp (nanoseconds).
    pub executed_at: u64,
    /// Whether this trade has been submitted to the settlement layer.
    pub settled: bool,
}

impl Trade {
    pub fn new(
        id: String,
        market: String,
        price: u64,
        quantity: u64,
        buyer_order_id: String,
        seller_order_id: String,
        buyer: String,
        seller: String,
    ) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        let notional = price.saturating_mul(quantity) / 1_000_000;
        Self {
            id,
            market,
            price,
            quantity,
            notional,
            buyer_order_id,
            seller_order_id,
            buyer,
            seller,
            executed_at: now,
            settled: false,
        }
    }
}

/// A batch of trades ready for on-chain settlement.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TradeBatch {
    pub batch_id: u64,
    pub trades: Vec<Trade>,
    pub merkle_root: String,
    pub total_value: u64,
    pub created_at: u64,
}

impl TradeBatch {
    pub fn new(batch_id: u64, trades: Vec<Trade>, merkle_root: String) -> Self {
        let total_value: u64 = trades.iter().map(|t| t.notional).sum();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        Self { batch_id, trades, merkle_root, total_value, created_at: now }
    }
}

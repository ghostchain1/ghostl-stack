use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// The side of an order: Buy (bid) or Sell (ask).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Side {
    Buy,
    Sell,
}

/// Institutional order types supported by GSX.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderType {
    /// Standard limit order — rests in the book until matched.
    Limit,
    /// Market order — matches at best available price immediately.
    Market,
    /// Immediate-or-cancel — fill what's available, cancel the rest.
    Ioc,
    /// Fill-or-kill — fill everything at once or cancel entirely.
    Fok,
    /// Block trade — negotiated off-book, submitted for settlement.
    BlockTrade,
    /// Request-for-quote — bilateral negotiation workflow.
    Rfq,
}

/// Status of an order throughout its lifecycle.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
    Rejected,
    Expired,
}

/// Core order struct — all fields required for institutional GSX trading.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Order {
    /// Unique order ID (UUID v4).
    pub id: String,
    /// GNS identity of the institution, e.g. "gov.us.treasury".
    pub institution: String,
    /// Target market, e.g. "GOLD/USD", "OIL/USD", "BONDS/USD".
    pub market: String,
    /// Buy or Sell.
    pub side: Side,
    /// Order type.
    pub order_type: OrderType,
    /// Limit price in micro-units (price * 1_000_000). 0 for market orders.
    pub price: u64,
    /// Quantity in standardized units (e.g. troy oz for gold, barrels for oil).
    pub quantity: u64,
    /// Remaining unfilled quantity.
    pub remaining: u64,
    /// Current status.
    pub status: OrderStatus,
    /// Unix timestamp (nanoseconds) when the order was created.
    pub created_at: u64,
    /// Optional client order reference for audit trail.
    pub client_ref: Option<String>,
    /// Compliance attestation token (from gsx-compliance service).
    pub compliance_token: Option<String>,
}

impl Order {
    /// Create a new open order.
    pub fn new(
        id: String,
        institution: String,
        market: String,
        side: Side,
        order_type: OrderType,
        price: u64,
        quantity: u64,
    ) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        Self {
            id,
            institution,
            market,
            side,
            order_type,
            price,
            quantity,
            remaining: quantity,
            status: OrderStatus::Open,
            created_at: now,
            client_ref: None,
            compliance_token: None,
        }
    }

    pub fn is_active(&self) -> bool {
        matches!(self.status, OrderStatus::Open | OrderStatus::PartiallyFilled)
    }
}

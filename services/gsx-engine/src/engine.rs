use std::sync::Arc;
use dashmap::DashMap;
use parking_lot::Mutex;
use tracing::{info, warn};
use uuid::Uuid;
use sha2::{Sha256, Digest};

use crate::order::{Order, OrderStatus, OrderType, Side};
use crate::orderbook::OrderBook;
use crate::trade::{Trade, TradeBatch};
use crate::matcher;

/// The GSX matching engine — manages all sovereign markets and their order books.
pub struct Engine {
    /// One locked OrderBook per market (e.g. "GOLD/USD").
    books: DashMap<String, Mutex<OrderBook>>,
    /// Pending trades awaiting batch settlement.
    pending_trades: Arc<Mutex<Vec<Trade>>>,
    /// Counter for settlement batch IDs.
    batch_counter: Arc<Mutex<u64>>,
    /// Committed settlement batches.
    batches: Arc<Mutex<Vec<TradeBatch>>>,
}

impl Engine {
    pub fn new() -> Self {
        let engine = Self {
            books:          DashMap::new(),
            pending_trades: Arc::new(Mutex::new(Vec::new())),
            batch_counter:  Arc::new(Mutex::new(0)),
            batches:        Arc::new(Mutex::new(Vec::new())),
        };
        // Pre-register well-known sovereign markets
        for market in &[
            "GOLD/USD", "OIL/USD", "GAS/USD", "ENERGY/USD",
            "BONDS/USD", "CBDC/USD", "LITHIUM/USD", "WHEAT/USD",
            "CARBON/USD", "INFRA/USD",
        ] {
            engine.add_market(market);
        }
        engine
    }

    /// Register a new market.
    pub fn add_market(&self, market: &str) {
        self.books.insert(market.to_owned(), Mutex::new(OrderBook::new(market)));
        info!("Market registered: {}", market);
    }

    /// Submit an order to the engine. Returns matched trades (if any).
    pub fn submit_order(&self, mut order: Order) -> (Order, Vec<Trade>) {
        let book_entry = match self.books.get(&order.market) {
            Some(e) => e,
            None    => {
                warn!("Unknown market: {}", order.market);
                order.status = OrderStatus::Rejected;
                return (order, vec![]);
            }
        };

        let mut book = book_entry.lock();

        // FOK check — reject before adding to book
        if order.order_type == OrderType::Fok && matcher::check_fok(&book, &order) {
            order.status = OrderStatus::Rejected;
            return (order, vec![]);
        }

        // Market orders get a sweep price
        if order.order_type == OrderType::Market {
            order.price = match order.side {
                Side::Buy  => u64::MAX,
                Side::Sell => 0,
            };
        }

        // Add to book, then run the matcher
        book.add_order(order.clone());
        let mut trades = matcher::match_orders(&mut book);

        // IOC: cancel any unfilled remainder
        if order.order_type == OrderType::Ioc {
            if let Some(o) = book.orders.get_mut(&order.id) {
                if o.is_active() {
                    o.status = OrderStatus::Cancelled;
                    book.cancel_order(&order.id);
                }
            }
        }

        // Retrieve final order state
        let final_order = book.orders.get(&order.id).cloned().unwrap_or(order);

        // Queue trades for settlement
        {
            let mut pending = self.pending_trades.lock();
            pending.extend(trades.clone());
            info!("Queued {} trades for settlement (pending total: {})", trades.len(), pending.len());
        }

        (final_order, trades)
    }

    /// Cancel an existing order.
    pub fn cancel_order(&self, market: &str, order_id: &str) -> bool {
        if let Some(entry) = self.books.get(market) {
            entry.lock().cancel_order(order_id)
        } else {
            false
        }
    }

    /// Get market depth (top 10 levels per side).
    pub fn market_depth(&self, market: &str) -> Option<(Vec<(u64, u64)>, Vec<(u64, u64)>)> {
        self.books.get(market).map(|e| e.lock().depth(10))
    }

    /// Flush pending trades into a settlement batch. Returns the batch.
    pub fn flush_batch(&self) -> Option<TradeBatch> {
        let mut pending = self.pending_trades.lock();
        if pending.is_empty() { return None; }

        let trades: Vec<Trade> = pending.drain(..).collect();
        let merkle_root = compute_merkle_root(&trades);

        let batch_id = {
            let mut ctr = self.batch_counter.lock();
            let id = *ctr;
            *ctr += 1;
            id
        };

        let batch = TradeBatch::new(batch_id, trades, merkle_root);
        info!("Settlement batch {} created: {} trades, value {}", batch.batch_id, batch.trades.len(), batch.total_value);
        self.batches.lock().push(batch.clone());
        Some(batch)
    }

    /// List all registered markets.
    pub fn markets(&self) -> Vec<String> {
        self.books.iter().map(|e| e.key().clone()).collect()
    }

    /// Return the N most recent settlement batches.
    pub fn recent_batches(&self, n: usize) -> Vec<TradeBatch> {
        let batches = self.batches.lock();
        batches.iter().rev().take(n).cloned().collect()
    }

    /// Pending trade count.
    pub fn pending_count(&self) -> usize {
        self.pending_trades.lock().len()
    }
}

/// Compute a simple Merkle root from trade IDs.
fn compute_merkle_root(trades: &[Trade]) -> String {
    if trades.is_empty() { return "0x".to_owned() + &"00".repeat(32); }
    let mut leaves: Vec<[u8; 32]> = trades.iter().map(|t| {
        let mut hasher = Sha256::new();
        hasher.update(t.id.as_bytes());
        hasher.update(t.price.to_le_bytes());
        hasher.update(t.quantity.to_le_bytes());
        hasher.finalize().into()
    }).collect();

    while leaves.len() > 1 {
        let mut next = Vec::new();
        for pair in leaves.chunks(2) {
            let mut hasher = Sha256::new();
            hasher.update(pair[0]);
            if pair.len() > 1 { hasher.update(pair[1]); } else { hasher.update(pair[0]); }
            next.push(hasher.finalize().into());
        }
        leaves = next;
    }

    "0x".to_owned() + &hex::encode(leaves[0])
}

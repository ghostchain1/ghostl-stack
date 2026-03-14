use std::collections::BTreeMap;
use crate::order::{Order, Side, OrderStatus};

/// Price-time priority order book for a single sovereign market.
///
/// Bids are sorted descending (highest first).
/// Asks are sorted ascending (lowest first).
pub struct OrderBook {
    pub market: String,
    /// Bids: price → time-ordered queue of orders (highest price best)
    pub bids: BTreeMap<u64, Vec<Order>>,
    /// Asks: price → time-ordered queue of orders (lowest price best)
    pub asks: BTreeMap<u64, Vec<Order>>,
    /// All active orders by ID for fast lookup.
    pub orders: std::collections::HashMap<String, Order>,
}

impl OrderBook {
    pub fn new(market: &str) -> Self {
        Self {
            market: market.to_owned(),
            bids:   BTreeMap::new(),
            asks:   BTreeMap::new(),
            orders: std::collections::HashMap::new(),
        }
    }

    /// Insert an order into the appropriate side.
    pub fn add_order(&mut self, order: Order) {
        let price = order.price;
        match order.side {
            Side::Buy  => self.bids.entry(price).or_default().push(order.clone()),
            Side::Sell => self.asks.entry(price).or_default().push(order.clone()),
        }
        self.orders.insert(order.id.clone(), order);
    }

    /// Cancel an active order by ID.
    pub fn cancel_order(&mut self, order_id: &str) -> bool {
        if let Some(order) = self.orders.get_mut(order_id) {
            if !order.is_active() { return false; }
            let price = order.price;
            let side  = order.side.clone();
            order.status = OrderStatus::Cancelled;
            // Remove from price level
            let book = match side {
                Side::Buy  => &mut self.bids,
                Side::Sell => &mut self.asks,
            };
            if let Some(queue) = book.get_mut(&price) {
                queue.retain(|o| o.id != order_id);
                if queue.is_empty() { book.remove(&price); }
            }
            true
        } else {
            false
        }
    }

    /// Best bid price (highest).
    pub fn best_bid(&self) -> Option<u64> {
        self.bids.keys().next_back().copied()
    }

    /// Best ask price (lowest).
    pub fn best_ask(&self) -> Option<u64> {
        self.asks.keys().next().copied()
    }

    /// Market depth summary — top N levels per side.
    pub fn depth(&self, levels: usize) -> (Vec<(u64, u64)>, Vec<(u64, u64)>) {
        let bids: Vec<(u64, u64)> = self.bids.iter().rev()
            .take(levels)
            .map(|(price, orders)| (*price, orders.iter().map(|o| o.remaining).sum()))
            .collect();
        let asks: Vec<(u64, u64)> = self.asks.iter()
            .take(levels)
            .map(|(price, orders)| (*price, orders.iter().map(|o| o.remaining).sum()))
            .collect();
        (bids, asks)
    }
}

use crate::order::{Order, OrderStatus, OrderType};
use crate::orderbook::OrderBook;
use crate::trade::Trade;
use uuid::Uuid;

/// Price-time priority matching algorithm.
///
/// Processes all crossable orders in the book and returns a list of executed trades.
/// Supports LIMIT, MARKET, IOC, FOK, and BLOCK_TRADE order types.
pub fn match_orders(book: &mut OrderBook) -> Vec<Trade> {
    let mut trades = Vec::new();

    loop {
        // Find the best bid and ask prices
        let best_bid = match book.bids.keys().next_back().copied() {
            Some(p) => p,
            None    => break,
        };
        let best_ask = match book.asks.keys().next().copied() {
            Some(p) => p,
            None    => break,
        };

        // No cross — spread is positive; markets are not crossing
        if best_bid < best_ask {
            break;
        }

        // Pop the front order from each matching price level
        let bid_opt = book.bids.get_mut(&best_bid).and_then(|q| {
            if q.is_empty() { None } else { Some(q.remove(0)) }
        });
        let ask_opt = book.asks.get_mut(&best_ask).and_then(|q| {
            if q.is_empty() { None } else { Some(q.remove(0)) }
        });

        let (mut bid, mut ask) = match (bid_opt, ask_opt) {
            (Some(b), Some(a)) => (b, a),
            _ => break,
        };

        // Execution price = ask price (price-time priority; aggressor pays ask)
        let exec_price = best_ask;
        let exec_qty   = bid.remaining.min(ask.remaining);

        // Record the trade
        trades.push(Trade::new(
            Uuid::new_v4().to_string(),
            book.market.clone(),
            exec_price,
            exec_qty,
            bid.id.clone(),
            ask.id.clone(),
            bid.institution.clone(),
            ask.institution.clone(),
        ));

        // Update remaining quantities
        bid.remaining -= exec_qty;
        ask.remaining -= exec_qty;

        // Update order statuses
        update_status(&mut bid);
        update_status(&mut ask);

        // Return partially filled orders to the book
        if bid.is_active() {
            book.bids.entry(best_bid).or_default().insert(0, bid.clone());
        }
        if ask.is_active() {
            book.asks.entry(best_ask).or_default().insert(0, ask.clone());
        }

        // Clean up empty price levels
        if book.bids.get(&best_bid).map_or(true, |q| q.is_empty()) {
            book.bids.remove(&best_bid);
        }
        if book.asks.get(&best_ask).map_or(true, |q| q.is_empty()) {
            book.asks.remove(&best_ask);
        }

        // Update order registry
        if let Some(o) = book.orders.get_mut(&bid.id) { o.remaining = bid.remaining; o.status = bid.status.clone(); }
        if let Some(o) = book.orders.get_mut(&ask.id) { o.remaining = ask.remaining; o.status = ask.status.clone(); }
    }

    trades
}

/// Handle IOC: cancel any remaining quantity after match attempt.
pub fn apply_ioc(book: &mut OrderBook, order: &mut Order) {
    if order.is_active() {
        order.status = OrderStatus::Cancelled;
    }
}

/// Handle FOK: if the full quantity cannot be immediately matched, reject entirely.
/// Returns true if the order should be rejected.
pub fn check_fok(book: &OrderBook, order: &Order) -> bool {
    let available = match order.side {
        crate::order::Side::Buy  => {
            book.asks.iter()
                .take_while(|(&p, _)| p <= order.price)
                .map(|(_, q)| q.iter().map(|o| o.remaining).sum::<u64>())
                .sum::<u64>()
        }
        crate::order::Side::Sell => {
            book.bids.iter().rev()
                .take_while(|(&p, _)| p >= order.price)
                .map(|(_, q)| q.iter().map(|o| o.remaining).sum::<u64>())
                .sum::<u64>()
        }
    };
    available < order.quantity
}

fn update_status(order: &mut Order) {
    if order.remaining == 0 {
        order.status = OrderStatus::Filled;
    } else if order.remaining < order.quantity {
        order.status = OrderStatus::PartiallyFilled;
    }
}

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { Fill, LimitOrder, OrderBookSnapshot, OrderStatus, PriceLevel, Side } from "./types";

/**
 * In-memory price-time priority order book.
 *
 * Bids are sorted descending by price (highest first).
 * Asks are sorted ascending  by price (lowest  first).
 *
 * Matching is continuous: every new order is immediately crossed
 * against the opposite side.  Unfilled remainder rests in the book.
 */
export class MatchingEngine extends EventEmitter {
  // pair key → sorted orders
  private bids: Map<string, LimitOrder[]> = new Map();
  private asks: Map<string, LimitOrder[]> = new Map();

  private fills: Fill[] = [];
  private allOrders: Map<string, LimitOrder> = new Map();

  // ─── Public API ─────────────────────────────────────────────────────────────

  placeOrder(order: Omit<LimitOrder, "orderId" | "filled" | "status" | "timestamp">): LimitOrder {
    const o: LimitOrder = {
      ...order,
      orderId:   randomUUID(),
      filled:    0n,
      status:    "OPEN",
      timestamp: Date.now(),
    };

    this.allOrders.set(o.orderId, o);

    const key = this._pairKey(o.baseToken, o.quoteToken);
    this._insert(key, o);
    this._match(key, o.baseToken, o.quoteToken);

    this.emit("order", o);
    return o;
  }

  cancelOrder(orderId: string, trader: string): LimitOrder {
    const o = this.allOrders.get(orderId);
    if (!o) throw new Error(`Order ${orderId} not found`);
    if (o.trader.toLowerCase() !== trader.toLowerCase()) throw new Error("Not your order");
    if (o.status !== "OPEN" && o.status !== "PARTIAL") throw new Error(`Order ${orderId} is ${o.status}`);

    o.status = "CANCELLED";
    const key = this._pairKey(o.baseToken, o.quoteToken);
    this._remove(key, o);
    this.emit("cancel", o);
    return o;
  }

  getOrder(orderId: string): LimitOrder | undefined {
    return this.allOrders.get(orderId);
  }

  getOpenOrders(trader: string): LimitOrder[] {
    return [...this.allOrders.values()].filter(
      (o) => o.trader.toLowerCase() === trader.toLowerCase() &&
             (o.status === "OPEN" || o.status === "PARTIAL"),
    );
  }

  getRecentFills(limit = 50): Fill[] {
    return this.fills.slice(-limit).reverse();
  }

  getSnapshot(baseToken: string, quoteToken: string, depth = 20): OrderBookSnapshot {
    const key = this._pairKey(baseToken, quoteToken);
    const bids = this._aggregate(this.bids.get(key) ?? [], depth);
    const asks = this._aggregate(this.asks.get(key) ?? [], depth);
    return {
      pair: `${baseToken}/${quoteToken}`,
      bids,
      asks,
      timestamp: Date.now(),
    };
  }

  // ─── Matching logic ─────────────────────────────────────────────────────────

  private _match(key: string, baseToken: string, quoteToken: string): void {
    const bids = this.bids.get(key) ?? [];
    const asks = this.asks.get(key) ?? [];

    while (bids.length > 0 && asks.length > 0) {
      const bid = bids[0];
      const ask = asks[0];

      if (bid.price < ask.price) break; // no cross

      // Fill quantity = min of remaining on each side.
      const bidRem = bid.baseAmount - bid.filled;
      const askRem = ask.baseAmount - ask.filled;
      const fillBase = bidRem < askRem ? bidRem : askRem;

      // Price-time: resting order is maker.
      const fillPrice = bid.timestamp <= ask.timestamp ? bid.price : ask.price;

      bid.filled += fillBase;
      ask.filled += fillBase;

      bid.status = bid.filled >= bid.baseAmount ? "FILLED" : "PARTIAL";
      ask.status = ask.filled >= ask.baseAmount ? "FILLED" : "PARTIAL";

      const fill: Fill = {
        fillId:      randomUUID(),
        buyOrderId:  bid.orderId,
        sellOrderId: ask.orderId,
        baseAmount:  fillBase,
        price:       fillPrice,
        timestamp:   Date.now(),
      };

      this.fills.push(fill);
      this.emit("fill", fill, bid, ask);

      if (bid.status === "FILLED") bids.shift();
      if (ask.status === "FILLED") asks.shift();
    }

    this.bids.set(key, bids);
    this.asks.set(key, asks);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private _insert(key: string, o: LimitOrder): void {
    if (o.side === "BUY") {
      const arr = this.bids.get(key) ?? [];
      arr.push(o);
      arr.sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : a.timestamp - b.timestamp));
      this.bids.set(key, arr);
    } else {
      const arr = this.asks.get(key) ?? [];
      arr.push(o);
      arr.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : a.timestamp - b.timestamp));
      this.asks.set(key, arr);
    }
  }

  private _remove(key: string, o: LimitOrder): void {
    const map = o.side === "BUY" ? this.bids : this.asks;
    const arr = map.get(key) ?? [];
    map.set(key, arr.filter((x) => x.orderId !== o.orderId));
  }

  private _aggregate(orders: LimitOrder[], depth: number): PriceLevel[] {
    const buckets = new Map<bigint, bigint>();
    for (const o of orders) {
      const rem = o.baseAmount - o.filled;
      if (rem > 0n) buckets.set(o.price, (buckets.get(o.price) ?? 0n) + rem);
    }
    return [...buckets.entries()]
      .slice(0, depth)
      .map(([price, amount]) => ({
        price:  price.toString(),
        amount: amount.toString(),
      }));
  }

  private _pairKey(base: string, quote: string): string {
    return `${base.toLowerCase()}/${quote.toLowerCase()}`;
  }
}

export const engine = new MatchingEngine();

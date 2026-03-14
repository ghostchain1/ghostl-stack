/**
 * Ghost X – API client helper.
 * Reads NEXT_PUBLIC_GHOSTX_API_URL from env (defaults to localhost:4100).
 */

const API_BASE = process.env.NEXT_PUBLIC_GHOSTX_API_URL ?? "http://localhost:4100";

export interface PriceLevel {
  price:  string;  // bigint as decimal string (18 dp)
  amount: string;
}

export interface BookSnapshot {
  pair:      string;
  bids:      PriceLevel[];
  asks:      PriceLevel[];
  timestamp: number;
}

export interface ApiOrder {
  orderId:    string;
  onChainId?: string;
  trader:     string;
  baseToken:  string;
  quoteToken: string;
  side:       "BUY" | "SELL";
  price:      string;
  baseAmount: string;
  filled:     string;
  status:     "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";
  timestamp:  number;
}

export interface ApiFill {
  fillId:      string;
  buyOrderId:  string;
  sellOrderId: string;
  baseAmount:  string;
  price:       string;
  timestamp:   number;
}

export async function fetchBook(base: string, quote: string, depth = 20): Promise<BookSnapshot> {
  const r = await fetch(`${API_BASE}/book?base=${base}&quote=${quote}&depth=${depth}`);
  if (!r.ok) throw new Error(`fetchBook: ${r.status}`);
  return r.json();
}

export async function fetchFills(limit = 50): Promise<ApiFill[]> {
  const r = await fetch(`${API_BASE}/book/fills?limit=${limit}`);
  if (!r.ok) throw new Error(`fetchFills: ${r.status}`);
  return r.json();
}

export async function placeOrder(payload: {
  trader:     string;
  baseToken:  string;
  quoteToken: string;
  side:       "BUY" | "SELL";
  price:      string;
  baseAmount: string;
}): Promise<ApiOrder> {
  const r = await fetch(`${API_BASE}/orders`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.json();
    throw new Error(body.error ?? `placeOrder: ${r.status}`);
  }
  return r.json();
}

export async function cancelOrder(orderId: string, trader: string): Promise<ApiOrder> {
  const r = await fetch(`${API_BASE}/orders/${orderId}`, {
    method:  "DELETE",
    headers: { "x-trader-address": trader },
  });
  if (!r.ok) {
    const body = await r.json();
    throw new Error(body.error ?? `cancelOrder: ${r.status}`);
  }
  return r.json();
}

/** Format a raw 18-dp bigint string to a human-readable decimal. */
export function fmt18(raw: string, decimals = 6): string {
  const n = BigInt(raw);
  const unit = 10n ** 18n;
  const whole = n / unit;
  const frac  = ((n % unit) * 10n ** BigInt(decimals)) / unit;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

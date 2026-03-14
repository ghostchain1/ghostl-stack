export type Side = "BUY" | "SELL";
export type OrderStatus = "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";

export interface LimitOrder {
  orderId: string;       // UUID assigned by the API
  onChainId?: bigint;   // ID returned by the contract after submission
  trader: string;        // checksummed EVM address
  baseToken: string;
  quoteToken: string;
  side: Side;
  /** 18-decimal fixed-point price (quote per base). */
  price: bigint;
  baseAmount: bigint;
  filled: bigint;
  timestamp: number;     // ms
  status: OrderStatus;
}

export interface Fill {
  fillId: string;
  buyOrderId: string;
  sellOrderId: string;
  baseAmount: bigint;
  price: bigint;
  timestamp: number;
}

export interface OrderBookSnapshot {
  pair: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: number;
}

export interface PriceLevel {
  price: string;   // decimal string (18 dp)
  amount: string;  // decimal string (18 dp)
}

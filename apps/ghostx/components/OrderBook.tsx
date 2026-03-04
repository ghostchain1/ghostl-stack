"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchBook, BookSnapshot, fmt18 } from "../lib/api";

interface Props {
  baseToken:  string;
  quoteToken: string;
  depth?:     number;
}

const WS_URL = (process.env.NEXT_PUBLIC_GHOSTX_WS_URL ?? "ws://localhost:4100") + "/ws";

export default function OrderBook({ baseToken, quoteToken, depth = 15 }: Props) {
  const [book, setBook] = useState<BookSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await fetchBook(baseToken, quoteToken, depth);
      setBook(snap);
    } catch (e: any) {
      setError(e.message);
    }
  }, [baseToken, quoteToken, depth]);

  // Initial load + polling fallback.
  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [load]);

  // WebSocket for real-time updates.
  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "fill" || msg.type === "order" || msg.type === "cancel") {
          load(); // re-fetch snapshot on any relevant event
        }
      };
    } catch { /* ws optional */ }
    return () => ws?.close();
  }, [load]);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-200">Order Book</h2>
        <span className="text-xs text-gray-500">{baseToken.slice(0, 6)}…/{quoteToken.slice(0, 6)}…</span>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-900/20">{error}</div>
      )}

      <div className="grid grid-cols-2 text-xs text-gray-500 px-4 py-1 border-b border-gray-800">
        <span>Price</span>
        <span className="text-right">Amount</span>
      </div>

      {/* Asks (sell side) – reversed so highest is at top */}
      <div className="divide-y divide-gray-800/50">
        {(book?.asks ?? []).slice(0, depth).reverse().map((level, i) => (
          <Row key={i} price={level.price} amount={level.amount} side="ask" />
        ))}
      </div>

      {/* Spread indicator */}
      {book && (
        <div className="px-4 py-1 text-center text-xs text-gray-500 border-y border-gray-800">
          {book.asks[0] && book.bids[0]
            ? `Spread: ${fmt18((BigInt(book.asks[0].price) - BigInt(book.bids[0].price)).toString())} GST`
            : "—"}
        </div>
      )}

      {/* Bids (buy side) */}
      <div className="divide-y divide-gray-800/50">
        {(book?.bids ?? []).slice(0, depth).map((level, i) => (
          <Row key={i} price={level.price} amount={level.amount} side="bid" />
        ))}
      </div>
    </div>
  );
}

function Row({ price, amount, side }: { price: string; amount: string; side: "bid" | "ask" }) {
  const color = side === "bid" ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="grid grid-cols-2 text-xs px-4 py-1 hover:bg-gray-800/50 transition-colors">
      <span className={color}>{fmt18(price)}</span>
      <span className="text-right text-gray-300">{fmt18(amount)}</span>
    </div>
  );
}

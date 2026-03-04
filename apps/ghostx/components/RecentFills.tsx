"use client";

import { useEffect, useState } from "react";
import { fetchFills, ApiFill, fmt18 } from "../lib/api";

const WS_URL = (process.env.NEXT_PUBLIC_GHOSTX_WS_URL ?? "ws://localhost:4100") + "/ws";

export default function RecentFills() {
  const [fills, setFills] = useState<ApiFill[]>([]);

  async function load() {
    try {
      const data = await fetchFills(30);
      setFills(data);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "fill") load();
      };
    } catch { /* ws optional */ }
    return () => ws?.close();
  }, []);

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="font-semibold text-sm text-gray-200">Recent Fills</h2>
      </div>

      <div className="grid grid-cols-3 text-xs text-gray-500 px-4 py-1 border-b border-gray-800">
        <span>Price</span>
        <span className="text-center">Amount</span>
        <span className="text-right">Time</span>
      </div>

      {fills.length === 0 && (
        <p className="text-center text-xs text-gray-600 py-8">No fills yet</p>
      )}

      <div className="divide-y divide-gray-800/50 max-h-60 overflow-y-auto">
        {fills.map((f) => (
          <div key={f.fillId} className="grid grid-cols-3 text-xs px-4 py-1 hover:bg-gray-800/50">
            <span className="text-emerald-400">{fmt18(f.price)}</span>
            <span className="text-center text-gray-300">{fmt18(f.baseAmount)}</span>
            <span className="text-right text-gray-500">
              {new Date(f.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// GhostStack — User Bridge (L1/L2/L3)
"use client";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface BridgeFee {
  estimatedFeeGST: number;
  estimatedTimeMs: number;
  minAmount:       number;
}

const CHAINS = [
  { id: "L1", label: "GhostChain L1", chainId: 14000101, color: "#7c3aed" },
  { id: "L2", label: "GhostL2 (OP)",  chainId: 901,      color: "#10b981" },
  { id: "L3", label: "GhostL3 (OP)",  chainId: 903,      color: "#f59e0b" },
];

export default function BridgePage() {
  const [fromChain, setFromChain] = useState("L1");
  const [toChain,   setToChain]   = useState("L2");
  const [amount,    setAmount]    = useState("");

  const { data: feeData } = useSWR<BridgeFee>(
    amount && parseFloat(amount) > 0 ? `/api/bridges/fee?from=${fromChain}&to=${toChain}&amount=${amount}` : null,
    fetcher,
  );

  function swapChains() {
    setFromChain(toChain);
    setToChain(fromChain);
  }

  const from = CHAINS.find(c => c.id === fromChain);
  const to   = CHAINS.find(c => c.id === toChain);

  return (
    <>
      <div className="page-header">
        <h1>🌉 Cross-Chain Bridge</h1>
        <p>Move GST between GhostChain L1, GhostL2, and GhostL3 — routing law enforced (L3→L2→L1)</p>
      </div>

      <div className="grid grid-2" style={{ alignItems: "flex-start" }}>

        {/* Bridge form */}
        <div>
          <div className="bridge-panel">
            <div className="card-title" style={{ marginBottom: "1rem" }}>Bridge GST</div>

            {/* From / To selectors */}
            <div className="bridge-from-to">
              <div style={{ flex: 1 }}>
                <div className="bridge-input-label">From</div>
                <select
                  value={fromChain}
                  onChange={e => setFromChain(e.target.value)}
                  className="bridge-input"
                >
                  {CHAINS.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.chainId})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                <button className="bridge-swap-btn" onClick={swapChains} title="Swap chains">⇄</button>
              </div>

              <div style={{ flex: 1 }}>
                <div className="bridge-input-label">To</div>
                <select
                  value={toChain}
                  onChange={e => setToChain(e.target.value)}
                  className="bridge-input"
                >
                  {CHAINS.filter(c => c.id !== fromChain).map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.chainId})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div className="bridge-input-group">
              <div className="bridge-input-label">Amount (GST)</div>
              <input
                type="number"
                className="bridge-input"
                placeholder="0.0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0"
              />
            </div>

            {/* Fee estimate */}
            {feeData && (
              <div style={{ background: "rgba(109,229,255,0.07)", border: "1px solid rgba(109,229,255,0.2)", borderRadius: "8px", padding: "0.6rem 0.85rem", fontSize: "0.78rem", marginBottom: "0.75rem", display: "flex", gap: "1.5rem" }}>
                <span>Est. fee: <strong>{feeData.estimatedFeeGST} GST</strong></span>
                <span>Est. time: <strong>~{Math.round(feeData.estimatedTimeMs / 60000)}m</strong></span>
              </div>
            )}

            {/* Routing note */}
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.75rem", padding: "0.5rem 0.6rem", background: "rgba(245,158,11,0.07)", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.15)" }}>
              ⚠️ Routing law: L3 transactions route through L2 → L1. Direct L3→L1 bridges are not permitted.
            </div>

            <button className="bridge-submit">
              Bridge {amount || "0"} GST: {fromChain} → {toChain}
            </button>
          </div>
        </div>

        {/* Right: Chain info + recent bridges */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <div className="card-title">Route Preview</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center", padding: "1rem 0" }}>
              <div style={{ background: from?.color + "22", border: `2px solid ${from?.color}`, borderRadius: "8px", padding: "0.5rem 1rem", fontWeight: 700, color: from?.color }}>
                {from?.label ?? "—"}
              </div>
              <svg width="40" height="16" viewBox="0 0 40 16"><path d="M0 8 H30 M24 2 L36 8 L24 14" stroke="currentColor" fill="none" strokeWidth="2" /></svg>
              {fromChain === "L3" && toChain === "L1" && (
                <>
                  <div style={{ background: "#10b98122", border: "2px solid #10b981", borderRadius: "8px", padding: "0.5rem 1rem", fontWeight: 700, color: "#10b981" }}>GhostL2</div>
                  <svg width="40" height="16" viewBox="0 0 40 16"><path d="M0 8 H30 M24 2 L36 8 L24 14" stroke="currentColor" fill="none" strokeWidth="2" /></svg>
                </>
              )}
              <div style={{ background: to?.color + "22", border: `2px solid ${to?.color}`, borderRadius: "8px", padding: "0.5rem 1rem", fontWeight: 700, color: to?.color }}>
                {to?.label ?? "—"}
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {amount ? `${amount} GST` : "Enter amount to preview"}
              {feeData ? ` → ${(parseFloat(amount) - feeData.estimatedFeeGST).toFixed(4)} GST received` : ""}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Bridge Addresses</div>
            {[
              { label: "L2L3Bridge",     addr: "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2" },
              { label: "L1 Rollup (L2)", addr: "0xad32D5C2Da9f4159C4cc98686C005852b3905355" },
              { label: "L2 Rollup (L3)", addr: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90" },
            ].map(b => (
              <div key={b.label} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.78rem", gap: "0.5rem" }}>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>{b.label}</span>
                <span style={{ fontFamily: "monospace", color: "var(--cyan)", fontSize: "0.7rem" }}>{b.addr.slice(0, 14)}…</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

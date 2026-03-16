"use client";
import { PublicNavbar, PublicFooter } from "@ghostchain/ui";
import { useState } from "react";

const mockBlocks = [
  { num: 1847392, hash: "0x3f4a...b82c", txs: 134, time: "2s ago", miner: "0xV1...d90e" },
  { num: 1847391, hash: "0xac19...012f", txs: 89, time: "7s ago", miner: "0xV2...a3b1" },
  { num: 1847390, hash: "0x771e...c543", txs: 210, time: "12s ago", miner: "0xV1...d90e" },
  { num: 1847389, hash: "0x0db3...8890", txs: 56, time: "17s ago", miner: "0xV3...ff22" },
  { num: 1847388, hash: "0xa2c7...1177", txs: 178, time: "22s ago", miner: "0xV4...7c8d" },
];

const chains = ["L1 — GhostChain", "L2 — GhostRollup", "L3 — GhostVM"];

export default function ExplorerPage() {
  const [chain, setChain] = useState(0);
  const [query, setQuery] = useState("");

  return (
    <>
      <PublicNavbar cta={{ label: "Dev Docs", href: "https://dev.ghostchain.cloud" }} />
      <main>
        {/* Hero / Search */}
        <section style={{ padding: "100px 24px 60px", textAlign: "center", background: "linear-gradient(180deg,#0A0A0A 0%,#0A0A0A 100%)" }}>
          <div className="container">
            <span className="tag">Block Explorer</span>
            <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, margin: "24px 0 40px" }}>
              Explore <span style={{ color: "#FFD700" }}>GhostChain</span>
            </h1>
            {/* Chain selector */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24, flexWrap: "wrap" }}>
              {chains.map((c, i) => (
                <button key={c} onClick={() => setChain(i)} style={{ padding: "8px 20px", borderRadius: 9999, border: "1px solid " + (chain === i ? "#FFD700" : "#1e293b"), background: chain === i ? "#FFD70022" : "transparent", color: chain === i ? "#FFD700" : "#94a3b8", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600 }}>{c}</button>
              ))}
            </div>
            {/* Search */}
            <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 12 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by block, tx hash, or address..."
                style={{ flex: 1, padding: "14px 20px", borderRadius: 10, background: "#0f172a", border: "1px solid #1e293b", color: "#e2e8f0", fontSize: "0.95rem", outline: "none" }}
              />
              <button className="btn-primary" style={{ borderRadius: 10, padding: "14px 24px" }}>Search</button>
            </div>
          </div>
        </section>

        {/* Recent Blocks */}
        <section style={{ padding: "60px 24px" }}>
          <div className="container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Recent Blocks — {chains[chain]}</h2>
              <span style={{ background: "#FFD70022", color: "#FFD700", padding: "4px 12px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600 }}>⬤ Live</span>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 24 }}>Showing mock data. Live data streams from RPC when nodes are connected.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b" }}>
                    {["Block", "Hash", "Txs", "Age", "Validator"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#64748b", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockBlocks.map((b) => (
                    <tr key={b.num} style={{ borderBottom: "1px solid #0f172a" }}>
                      <td style={{ padding: "12px 14px", color: "#FFD700", fontWeight: 600 }}>#{b.num}</td>
                      <td style={{ padding: "12px 14px", color: "#94a3b8" }}>{b.hash}</td>
                      <td style={{ padding: "12px 14px" }}>{b.txs}</td>
                      <td style={{ padding: "12px 14px", color: "#94a3b8" }}>{b.time}</td>
                      <td style={{ padding: "12px 14px", color: "#FFAA00" }}>{b.miner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section style={{ padding: "40px 24px", background: "#0A0A0A" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 20, textAlign: "center" }}>
            {[
              { label: "TPS", value: "2,847" },
              { label: "Total Blocks", value: "1.84M+" },
              { label: "Total Txs", value: "48.3M+" },
              { label: "Validators", value: "128" },
              { label: "Avg Block Time", value: "5s" },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#FFD700" }}>{s.value}</div>
                <div style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

// GhostStack C3 — Bridge Status (L1↔L2↔L3)
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface BridgeTx {
  txHash:    string;
  from:      string;
  to:        string;
  amount:    string;
  token:     string;
  srcChain:  string;
  dstChain:  string;
  status:    "pending" | "finalized" | "failed";
  timestamp: number;
}

interface BridgeSummary {
  l1l2: { tvlGST: number; pending: number; finalized24h: number; latencyMs: number; healthy: boolean };
  l2l3: { tvlGST: number; pending: number; finalized24h: number; latencyMs: number; healthy: boolean };
  recentTxs: BridgeTx[];
}

function timeSince(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60)  return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  return `${Math.floor(d/3600)}h ago`;
}

const BRIDGE_ADDRS = {
  "L2L3Bridge":       "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2",
  "L1 Rollup (L2)":   "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
  "L2 Rollup (L3)":   "0x130A46b6E41DB6E1e18fb9c759F223c459190e90",
  "Finality Oracle L1": "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422",
  "Finality Oracle L2": "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A",
  "Finality Oracle L3": "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127",
};

export default function BridgesPage() {
  const { data, isLoading, mutate } = useSWR<BridgeSummary>(
    "/api/bridges/status",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const statusBadge = (h?: boolean) =>
    h === undefined ? <span className="badge badge-gray">—</span>
    : h ? <span className="badge badge-green"><span className="dot" />Healthy</span>
    :     <span className="badge badge-red">⚠ Degraded</span>;

  const txStatusColor = (s: string) =>
    s === "finalized" ? "var(--green)" : s === "pending" ? "var(--yellow)" : "var(--red)";

  return (
    <>
      <div className="page-header">
        <h1>🌉 Bridge Status</h1>
        <p>Cross-chain bridge telemetry — GhostChain L1 ↔ GhostL2 ↔ GhostL3 · Routing law enforced</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          {statusBadge(data?.l1l2.healthy)}
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>L1↔L2</span>
          {statusBadge(data?.l2l3.healthy)}
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>L2↔L3</span>
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Bridge metrics */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>

        {/* L1 ↔ L2 */}
        <div className="card" style={{ borderTop: "3px solid #7c3aed" }}>
          <div className="card-title">GhostChain L1 ↔ GhostL2 (chain 14000101 ↔ 901)</div>
          <div className="grid grid-3" style={{ gap: "0.6rem", marginBottom: "1rem" }}>
            <div>
              <div className="stat-label">TVL (GST)</div>
              <div className="stat-value" style={{ fontSize: "1.3rem" }}>{data ? data.l1l2.tvlGST.toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="stat-label">Pending Txs</div>
              <div className="stat-value" style={{ fontSize: "1.3rem", color: "var(--yellow)" }}>{data?.l1l2.pending ?? "—"}</div>
            </div>
            <div>
              <div className="stat-label">Finalized 24h</div>
              <div className="stat-value" style={{ fontSize: "1.3rem", color: "var(--green)" }}>{data?.l1l2.finalized24h ?? "—"}</div>
            </div>
          </div>
          <div className="info-row">
            <span className="info-label">Finality Latency</span>
            <span className="info-value" style={{ color: (data?.l1l2.latencyMs ?? 999) < 500 ? "var(--green)" : "var(--yellow)" }}>
              {data ? `${data.l1l2.latencyMs}ms` : "—"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">L1 Rollup Contract</span>
            <span className="info-value" style={{ fontSize: "0.68rem", fontFamily: "monospace", color: "var(--cyan)" }}>0xad32…5355</span>
          </div>
          <div className="info-row">
            <span className="info-label">Finality Oracle L1</span>
            <span className="info-value" style={{ fontSize: "0.68rem", fontFamily: "monospace", color: "var(--cyan)" }}>0x7B3B…a422</span>
          </div>
        </div>

        {/* L2 ↔ L3 */}
        <div className="card" style={{ borderTop: "3px solid #10b981" }}>
          <div className="card-title">GhostL2 ↔ GhostL3 (chain 901 ↔ 903)</div>
          <div className="grid grid-3" style={{ gap: "0.6rem", marginBottom: "1rem" }}>
            <div>
              <div className="stat-label">TVL (GST)</div>
              <div className="stat-value" style={{ fontSize: "1.3rem" }}>{data ? data.l2l3.tvlGST.toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="stat-label">Pending Txs</div>
              <div className="stat-value" style={{ fontSize: "1.3rem", color: "var(--yellow)" }}>{data?.l2l3.pending ?? "—"}</div>
            </div>
            <div>
              <div className="stat-label">Finalized 24h</div>
              <div className="stat-value" style={{ fontSize: "1.3rem", color: "var(--green)" }}>{data?.l2l3.finalized24h ?? "—"}</div>
            </div>
          </div>
          <div className="info-row">
            <span className="info-label">Finality Latency</span>
            <span className="info-value" style={{ color: (data?.l2l3.latencyMs ?? 999) < 500 ? "var(--green)" : "var(--yellow)" }}>
              {data ? `${data.l2l3.latencyMs}ms` : "—"}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">L2L3Bridge Contract</span>
            <span className="info-value" style={{ fontSize: "0.68rem", fontFamily: "monospace", color: "var(--cyan)" }}>0xDadd…dC2</span>
          </div>
          <div className="info-row">
            <span className="info-label">L2 Rollup Contract</span>
            <span className="info-value" style={{ fontSize: "0.68rem", fontFamily: "monospace", color: "var(--cyan)" }}>0x130A…90</span>
          </div>
        </div>
      </div>

      {/* Canonical addresses reference */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Canonical Bridge Addresses</div>
        <table className="data-table">
          <thead><tr><th>Contract</th><th>Address</th><th>Layer</th></tr></thead>
          <tbody>
            {Object.entries(BRIDGE_ADDRS).map(([name, addr]) => (
              <tr key={name}>
                <td style={{ fontWeight: 600 }}>{name}</td>
                <td className="mono" style={{ fontSize: "0.75rem", color: "var(--cyan)" }}>{addr}</td>
                <td><span className="badge badge-gray">{name.includes("L1") ? "L1" : name.includes("L3") ? "L3" : name.includes("L2L3") ? "L2" : "L1"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent bridge transactions */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">Recent Bridge Transactions</span>
          {isLoading && <span className="badge badge-yellow">Loading…</span>}
        </div>
        {(data?.recentTxs ?? []).length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tx Hash</th>
                <th>Route</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentTxs ?? []).map((tx, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: "0.72rem", color: "var(--cyan)" }}>{tx.txHash.slice(0, 18)}…</td>
                  <td><span style={{ fontSize: "0.78rem" }}>{tx.srcChain} → {tx.dstChain}</span></td>
                  <td style={{ fontWeight: 700 }}>{tx.amount} {tx.token}</td>
                  <td><span style={{ color: txStatusColor(tx.status), fontWeight: 600, fontSize: "0.78rem" }}>{tx.status}</span></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{timeSince(tx.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>
            {isLoading ? "Loading transactions…" : "No recent bridge transactions available."}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Explorer — block heights, recent cross-chain transactions, and chain health.
 * Sources: blockchainApi (GIN chain metrics, L1 stats), GIEX bridge messages.
 */

import { fetchNetworkOverview, formatGwei } from "@/lib/blockchainApi";
import {
  fetchGiexBridges,
  fetchGiexMessages,
  type GiexBridge,
  type GiexMessage,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";

export const metadata = { title: "Explorer · GhostStack" };
export const revalidate = 10;

const STATUS_COLOR: Record<string, string> = {
  operational: "var(--green)",
  delivered:   "var(--green)",
  pending:     "var(--yellow)",
  confirming:  "var(--yellow)",
  degraded:    "var(--yellow)",
  congested:   "var(--yellow)",
  failed:      "var(--red)",
  unknown:     "var(--text-muted)",
};

function fmtTs(ts: number) {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString();
}

export default async function ExplorerPage() {
  const [overview, bridges, messages] = await Promise.all([
    fetchNetworkOverview(),
    fetchGiexBridges(),
    fetchGiexMessages({ limit: 20 }).catch(() => null),
  ]);

  const chains   = overview?.chains ?? [];
  const bridgeList: GiexBridge[]  = bridges ?? [];
  const msgList: GiexMessage[]    = messages ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Explorer</h1>
        <p>Block heights, chain health, and recent cross-chain transactions</p>
      </div>

      {/* Network summary KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Active Chains</div>
          <div className="card-value">{chains.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Healthy Chains</div>
          <div className="card-value" style={{ color: "var(--green)" }}>{overview?.healthyChains ?? 0}</div>
        </div>
        <div className="card">
          <div className="card-title">Network TPS</div>
          <div className="card-value" style={{ color: "var(--accent)" }}>
            {(overview?.totalTps ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Bridge Routes</div>
          <div className="card-value">{bridgeList.filter((b) => b.status === "active").length} / {bridgeList.length}</div>
        </div>
      </div>

      {/* Chain status table */}
      <SectionHeader title="Chain Registry" sub="Live block heights and gas from GIN" />
      {chains.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No chain data — GIN offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Layer</th>
              <th>Block Height</th>
              <th>TPS</th>
              <th>Gas Price</th>
              <th>Avg Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={c.chainId}>
                <td style={{ color: "var(--accent)", fontWeight: 700 }}>{c.label}</td>
                <td style={{ color: "var(--text-muted)" }}>{c.layer}</td>
                <td className="code">{c.blockHeight.toLocaleString()}</td>
                <td>{c.tps.toFixed(1)}</td>
                <td className="code" style={{ fontSize: "0.8rem" }}>{formatGwei(BigInt(c.gasPrice))}</td>
                <td>{c.latencyMs} ms</td>
                <td style={{ color: STATUS_COLOR[c.status] ?? "inherit", fontWeight: 600 }}>
                  {c.status.toUpperCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Recent cross-chain messages */}
      {msgList.length > 0 && (
        <>
          <SectionHeader title="Recent Cross-Chain Messages" sub="GIEX inter-chain message relay log" />
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Source → Dst</th>
                <th>Protocol</th>
                <th>Type</th>
                <th>Gas (USD)</th>
                <th>Retries</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {msgList.map((m: GiexMessage) => (
                <tr key={m.id}>
                  <td style={{ color: STATUS_COLOR[m.status.toLowerCase()] ?? "inherit", fontWeight: 600, fontSize: "0.78rem" }}>
                    {m.status.toUpperCase()}
                  </td>
                  <td style={{ color: "var(--accent)" }}>{m.source} → {m.destination}</td>
                  <td style={{ color: "var(--text-muted)" }}>{m.protocol}</td>
                  <td>{m.type}</td>
                  <td>${m.gasPaid_USD.toFixed(4)}</td>
                  <td style={{ color: m.retries > 0 ? "var(--yellow)" : "inherit" }}>{m.retries}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtTs(m.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Bridge route summary */}
      {bridgeList.length > 0 && (
        <>
          <SectionHeader title="Bridge Routes" sub="GIEX: active cross-chain bridge stats" />
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Daily Volume</th>
                <th>Total Volume</th>
                <th>Success Rate</th>
                <th>Fee (bps)</th>
              </tr>
            </thead>
            <tbody>
              {bridgeList.map((b: GiexBridge) => (
                <tr key={b.id}>
                  <td style={{ color: "var(--accent)" }}>{b.source} → {b.destination}</td>
                  <td style={{ color: "var(--text-muted)" }}>{b.mode}</td>
                  <td style={{ color: STATUS_COLOR[b.status.toLowerCase()] ?? "inherit", fontWeight: 600, fontSize: "0.78rem" }}>
                    {b.status.toUpperCase()}
                  </td>
                  <td>${b.dailyVolume_USD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>${b.totalVolume_USD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={{ color: b.successRate >= 0.95 ? "var(--green)" : "var(--yellow)" }}>
                    {(b.successRate * 100).toFixed(1)}%
                  </td>
                  <td>{b.bridgeFee_bps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * Chain — multi-layer GhostChain network status.
 * Pulls live data from GIN chain metrics + blockchainApi L1 RPC.
 */

import { fetchNetworkOverview, formatGwei } from "@/lib/blockchainApi";
import { fetchGiexSummary }                 from "@/lib/api";
import { SectionHeader }                    from "@/components/dashboard/MetricCard";
import { StatusBadge }                      from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Chain Status · GhostStack" };
export const revalidate = 15;

const LAYER_COLORS: Record<string, string> = {
  L1: "var(--accent)",
  L2: "var(--green)",
  L3: "var(--yellow)",
};

export default async function ChainPage() {
  const [overview, giex] = await Promise.all([
    fetchNetworkOverview(),
    fetchGiexSummary(),
  ]);

  const { chains, totalTps, healthyChains } = overview;
  const snap = giex?.snapshot;

  return (
    <div>
      <div className="page-header">
        <h1>Chain Status</h1>
        <p>GhostChain L1 · GhostL2 · GhostL3 — live network overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Tracked Chains</div>
          <div className="card-value">{chains.length || "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Healthy</div>
          <div className="card-value">{healthyChains} / {chains.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Total TPS</div>
          <div className="card-value">{totalTps.toFixed(1)}</div>
        </div>
        <div className="card">
          <div className="card-title">Interchain Score</div>
          <div className="card-value">
            {snap ? snap.interchainHealthScore.toFixed(0) + "%" : "—"}
          </div>
        </div>
      </div>

      {/* Per-chain table */}
      <SectionHeader title="Chain Metrics" sub="Sourced from GIN intelligence layer" />
      {chains.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No chain data available — GIN offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Chain</th>
              <th>Block Height</th>
              <th>TPS</th>
              <th>Gas Price</th>
              <th>Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {chains.map(c => (
              <tr key={c.chainId}>
                <td>
                  <span style={{ color: LAYER_COLORS[c.layer] ?? "inherit", fontWeight: 700 }}>
                    {c.layer}
                  </span>
                </td>
                <td>{c.label}</td>
                <td>{c.blockHeight.toLocaleString()}</td>
                <td>{c.tps.toFixed(2)}</td>
                <td>{formatGwei(BigInt(c.gasPrice))}</td>
                <td>{c.latencyMs} ms</td>
                <td>
                  <StatusBadge
                    ok={c.status === "operational"}
                    onLabel={c.status}
                    offLabel={c.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Interchain summary */}
      {snap && (
        <>
          <SectionHeader title="Interchain Bridge Summary" sub="Via GIEX engine" />
          <div className="grid grid-4">
            <div className="card">
              <div className="card-title">Active Bridges</div>
              <div className="card-value">{snap.bridges.active}</div>
              <div className="card-sub">of {snap.bridges.total}</div>
            </div>
            <div className="card">
              <div className="card-title">Daily Bridge Volume</div>
              <div className="card-value">
                ${(snap.bridges.dailyVolume_USD / 1e6).toFixed(2)}M
              </div>
            </div>
            <div className="card">
              <div className="card-title">Liquidity Pools</div>
              <div className="card-value">{snap.liquidity.activePools}</div>
            </div>
            <div className="card">
              <div className="card-title">Total TVL</div>
              <div className="card-value">
                ${(snap.liquidity.totalTVL_USD / 1e6).toFixed(2)}M
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

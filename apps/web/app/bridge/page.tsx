/**
 * Bridge — cross-chain bridge status, volumes, and liquidity pools.
 * Sources: GIEX interchain engine.
 */

import {
  fetchGiexBridges,
  fetchGiexPools,
  fetchGiexAssets,
  fetchGiexSummary,
  type GiexBridge,
  type GiexPool,
  type GiexWrappedAsset,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";
import { StatusBadge }   from "@/components/dashboard/StatusBadge";

export const metadata = { title: "Bridge · GhostStack" };
export const revalidate = 20;

const fmt = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` :
  n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` :
  `$${n.toFixed(2)}`;

export default async function BridgePage() {
  const [bridges, pools, assets, summary] = await Promise.all([
    fetchGiexBridges(),
    fetchGiexPools(),
    fetchGiexAssets(),
    fetchGiexSummary(),
  ]);

  const snap = summary?.snapshot;

  return (
    <div>
      <div className="page-header">
        <h1>Cross-Chain Bridge</h1>
        <p>GIEX interchain engine — bridges, liquidity, and wrapped assets</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Active Bridges</div>
          <div className="card-value">{snap?.bridges.active ?? bridges?.length ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Daily Volume</div>
          <div className="card-value">{snap ? fmt(snap.bridges.dailyVolume_USD) : "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Total TVL</div>
          <div className="card-value">{snap ? fmt(snap.liquidity.totalTVL_USD) : "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Health Score</div>
          <div className="card-value">{snap ? snap.interchainHealthScore.toFixed(0) + "%" : "—"}</div>
        </div>
      </div>

      {/* Bridge table */}
      <SectionHeader title="Bridge Routes" sub="Cross-chain transfer routes" />
      {!bridges || bridges.length === 0 ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No bridge data — GIEX offline?</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Mode</th>
              <th>Daily Volume</th>
              <th>Total Volume</th>
              <th>Tx Count</th>
              <th>Success Rate</th>
              <th>Fee (bps)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bridges.map((b: GiexBridge) => (
              <tr key={b.id}>
                <td>
                  <span style={{ color: "var(--accent)" }}>{b.source}</span>
                  {" → "}
                  <span style={{ color: "var(--green)" }}>{b.destination}</span>
                </td>
                <td style={{ color: "var(--text-muted)" }}>{b.mode}</td>
                <td>{fmt(b.dailyVolume_USD)}</td>
                <td>{fmt(b.totalVolume_USD)}</td>
                <td>{b.txCount.toLocaleString()}</td>
                <td style={{ color: b.successRate >= 99 ? "var(--green)" : b.successRate >= 95 ? "var(--yellow)" : "var(--red)" }}>
                  {b.successRate.toFixed(1)}%
                </td>
                <td>{b.bridgeFee_bps}</td>
                <td><StatusBadge ok={b.status === "active"} onLabel={b.status} offLabel={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Liquidity pools */}
      {pools && pools.length > 0 && (
        <>
          <SectionHeader title="Liquidity Pools" sub="Cross-chain DEX liquidity" />
          <table className="table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Chain</th>
                <th>Protocol</th>
                <th>TVL</th>
                <th>APY</th>
                <th>24h Volume</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p: GiexPool) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td>{p.chain}</td>
                  <td style={{ color: "var(--text-muted)" }}>{p.protocol}</td>
                  <td>{fmt(p.tvl_USD)}</td>
                  <td style={{ color: "var(--green)" }}>{p.apy.toFixed(1)}%</td>
                  <td>{fmt(p.volume24h_USD)}</td>
                  <td><StatusBadge ok={p.status === "active"} onLabel={p.status} offLabel={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Wrapped assets */}
      {assets && assets.length > 0 && (
        <>
          <SectionHeader title="Wrapped Assets" sub="wGST and cross-chain tokens" />
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Network</th>
                <th>Standard</th>
                <th>Supply</th>
                <th>Price</th>
                <th>Market Cap</th>
                <th>Peg Deviation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a: GiexWrappedAsset) => (
                <tr key={a.id}>
                  <td style={{ color: "var(--accent)", fontWeight: 700 }}>{a.token}</td>
                  <td>{a.network}</td>
                  <td style={{ color: "var(--text-muted)" }}>{a.standard}</td>
                  <td>{a.circulatingSupply.toLocaleString()}</td>
                  <td>${a.price_USD.toFixed(4)}</td>
                  <td>{fmt(a.marketCap_USD)}</td>
                  <td style={{ color: Math.abs(a.pegDeviation_pct) > 0.5 ? "var(--red)" : "var(--green)" }}>
                    {a.pegDeviation_pct > 0 ? "+" : ""}{a.pegDeviation_pct.toFixed(3)}%
                  </td>
                  <td><StatusBadge ok={a.status === "active"} onLabel={a.status} offLabel={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * Wallet — GST token market overview and treasury summary.
 * This is an admin read-only view (server-rendered); wallet connection
 * is handled on the user-facing ecosystem / dApp layer.
 */

import {
  fetchEieMarket,
  fetchEieTreasury,
  fetchEieTokenomics,
  type EieMarketTick,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";

export const metadata = { title: "Wallet & Market · GhostStack" };
export const revalidate = 30;

function fmtWei(wei: string | undefined) {
  if (!wei) return "—";
  try {
    const gst = Number(BigInt(wei) / BigInt(1e15)) / 1e3;
    return gst.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " GST";
  } catch { return wei; }
}

export default async function WalletPage() {
  const [market, treasury, tok] = await Promise.all([
    fetchEieMarket(),
    fetchEieTreasury(),
    fetchEieTokenomics(),
  ]);

  const ticks: EieMarketTick[] = market?.latestTicks ?? [];
  const gstTick  = ticks.find((t) => t.pair.startsWith("GST")) ?? ticks[0];
  const gstPrice = gstTick?.priceUsd ?? 0;
  const gstChange = gstTick?.change24hPct ?? 0;

  const treasuryState = treasury?.state;
  const params = tok?.current;

  return (
    <div>
      <div className="page-header">
        <h1>Wallet &amp; Market</h1>
        <p>GST token price, treasury state, and on-chain market data</p>
      </div>

      {/* GST price hero */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-title">GST Price</div>
          <div className="card-value" style={{ fontSize: "2rem", color: "var(--accent)" }}>
            ${gstPrice.toFixed(6)}
          </div>
          <div className="card-sub" style={{ color: gstChange >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
            {gstChange >= 0 ? "▲" : "▼"} {Math.abs(gstChange).toFixed(2)}% 24h
          </div>
        </div>
        {gstTick && (
          <>
            <div className="card">
              <div className="card-title">24h Volume</div>
              <div className="card-value" style={{ fontSize: "1.1rem" }}>
                ${gstTick.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Liquidity</div>
              <div className="card-value" style={{ fontSize: "1.1rem" }}>
                ${gstTick.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Treasury state */}
      {treasuryState && (
        <>
          <SectionHeader title="Treasury" sub="EIE treasury state" />
          <div className="grid grid-4">
            {[
                          ["‘Total Allocated", fmtWei(treasuryState.totalAllocated)],
              ["Pending Governance", fmtWei(treasuryState.pendingGovernance)],
              ["Invested", fmtWei(treasuryState.investedWei)],
              ["Accrued Revenue", fmtWei(treasuryState.accruedRevenueWei)],
            ].map(([label, value]) => (
              <div key={label} className="card">
                <div className="card-title">{label}</div>
                <div className="card-value" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tokenomics quick ref */}
      {params && (
        <>
          <SectionHeader title="Token Parameters" sub="Active EIE tokenomic configuration" />
          <div className="grid grid-4">
            {[
              ["Burn Rate", (params.burnRateBps / 100).toFixed(2) + "%"],
              ["Validator Reward", (params.validatorRewardBps / 100).toFixed(2) + "%"],
              ["Staking Incentive", (params.stakingIncentiveBps / 100).toFixed(2) + "%"],
              ["Reserve Ratio", params.reserveRatioPct.toFixed(1) + "%"],
            ].map(([label, value]) => (
              <div key={label} className="card">
                <div className="card-title">{label}</div>
                <div className="card-value" style={{ fontSize: "1rem" }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* All market ticks */}
      {ticks.length > 0 && (
        <>
          <SectionHeader title="All Market Ticks" sub="Live pair data from EIE market engine" />
          <table className="table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Price (USD)</th>
                <th>24h Change</th>
                <th>Volume 24h</th>
                <th>Liquidity</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {ticks.map((t: EieMarketTick, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--accent)", fontWeight: 700 }}>{t.pair}</td>
                  <td>${t.priceUsd.toFixed(6)}</td>
                  <td style={{ color: t.change24hPct >= 0 ? "var(--green)" : "var(--red)" }}>
                    {t.change24hPct >= 0 ? "+" : ""}{t.change24hPct.toFixed(2)}%
                  </td>
                  <td>${t.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>${t.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={{ color: "var(--text-muted)" }}>{t.source}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {new Date(t.timestamp < 1e12 ? t.timestamp * 1000 : t.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="card" style={{ marginTop: "1.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        <strong>Note:</strong> This is a read-only admin view. To connect a wallet or interact with GST contracts on-chain,
        use the <a href="/ecosystem" style={{ color: "var(--accent)" }}>Ecosystem</a> dApp or{" "}
        <a href="/developers" style={{ color: "var(--accent)" }}>Developer Portal</a>.
      </div>
    </div>
  );
}

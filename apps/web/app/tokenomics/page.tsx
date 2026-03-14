/**
 * Tokenomics — GST token parameters, burn schedule, and market report.
 * Sources: EIE economy engine.
 */

import {
  fetchEieTokenomics,
  fetchEieMarket,
  type EieTokenomicsParams,
  type EieBurnProjection,
  type EieMarketTick,
} from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/MetricCard";

export const metadata = { title: "Tokenomics · GhostStack" };
export const revalidate = 60;

const SENTIMENT_COLOR: Record<string, string> = {
  strong_bullish: "var(--green)",
  bullish:        "var(--green)",
  neutral:        "var(--text-muted)",
  bearish:        "var(--red)",
  strong_bearish: "var(--red)",
};

export default async function TokenomicsPage() {
  const [tok, market] = await Promise.all([
    fetchEieTokenomics(),
    fetchEieMarket(),
  ]);

  const params: EieTokenomicsParams | undefined  = tok?.current;
  const burn:   EieBurnProjection[]              = tok?.burnSchedule ?? [];
  const ticks:  EieMarketTick[]                  = market?.latestTicks ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Tokenomics</h1>
        <p>GST token parameters, burn schedule, and market data</p>
      </div>

      {/* Market sentiment */}
      {market && (
        <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
          <div className="card">
            <div className="card-title">Sentiment</div>
            <div className="card-value" style={{ color: SENTIMENT_COLOR[market.sentiment] ?? "inherit", fontSize: "0.9rem" }}>
              {market.sentiment.replace(/_/g, " ").toUpperCase()}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Sentiment Score</div>
            <div className="card-value">{market.sentimentScore.toFixed(1)}</div>
          </div>
          <div className="card">
            <div className="card-title">Active Alerts</div>
            <div className="card-value" style={{ color: market.activeAlerts.length > 0 ? "var(--yellow)" : "var(--green)" }}>
              {market.activeAlerts.length}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Arb Signals</div>
            <div className="card-value">{market.arbitrageSignals.length}</div>
          </div>
        </div>
      )}

      {/* Current params */}
      <SectionHeader title="Active Tokenomic Parameters" sub="EIE current configuration" />
      {!params ? (
        <div className="card" style={{ color: "var(--text-muted)" }}>No data — EIE offline?</div>
      ) : (
        <div className="grid grid-4">
          {[
            ["Base Fee", params.baseFeeGwei + " Gwei"],
            ["Burn Rate", (params.burnRateBps / 100).toFixed(2) + "%"],
            ["Validator Reward", (params.validatorRewardBps / 100).toFixed(2) + "%"],
            ["Staking Incentive", (params.stakingIncentiveBps / 100).toFixed(2) + "%"],
            ["Reserve Ratio", params.reserveRatioPct.toFixed(1) + "%"],
          ].map(([label, value]) => (
            <div key={label} className="card">
              <div className="card-title">{label}</div>
              <div className="card-value" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Market ticks */}
      {ticks.length > 0 && (
        <>
          <SectionHeader title="Live Market Ticks" sub="GST pair prices sourced by EIE" />
          <table className="table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Price (USD)</th>
                <th>24h Change</th>
                <th>Volume 24h</th>
                <th>Liquidity</th>
                <th>Source</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Burn schedule */}
      {burn.length > 0 && (
        <>
          <SectionHeader title="Burn Schedule" sub="Projected GST burn over time" />
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Date</th>
                <th>Estimated Burn (GST)</th>
                <th>Cumulative Burn (GST)</th>
              </tr>
            </thead>
            <tbody>
              {burn.slice(0, 30).map((b: EieBurnProjection) => (
                <tr key={b.day}>
                  <td>{b.day}</td>
                  <td style={{ color: "var(--text-muted)" }}>{b.date}</td>
                  <td style={{ color: "var(--accent)" }}>{b.estimatedBurnGhost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td>{b.cumulativeBurnGhost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

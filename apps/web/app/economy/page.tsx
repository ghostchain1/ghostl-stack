/**
 * economy/page.tsx — GhostBrain Economic Intelligence Engine Dashboard
 *
 * Sections:
 *   1. EIE Status         — cycle count, market sentiment, sim pass rate
 *   2. Treasury Overview  — allocated / pending governance / investments / revenue
 *   3. Allocations        — pending and recent allocation table
 *   4. Grants             — open grants and milestones
 *   5. Liquidity Pools    — pool health, utilisation, APY
 *   6. Active Strategies  — queued liquidity strategy actions
 *   7. Tokenomics         — current params, bounds, burn schedule
 *   8. Market Intelligence — pair prices, volatility, sentiment, active alerts
 *   9. Simulation Lab     — pass/fail/warn stats, recent history
 *  10. API Reference       — endpoint catalogue
 */

import type { Metadata } from "next";

import {
  fetchEieStatus,
  fetchEieTreasury,
  fetchEieLiquidity,
  fetchEieTokenomics,
  fetchEieMarket,
  fetchEieSimHistory,
  type EieTreasuryAllocation,
  type EieGrant,
  type EieInvestmentPosition,
  type EieLiquidityPool,
  type EieLiquidityStrategy,
  type EieBurnProjection,
  type EieOptimizationRecord,
  type EieMarketTick,
  type EieMarketAlert,
  type EieSimResult,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Economic Intelligence Engine | GhostBrain",
  description: "GhostStack EIE — treasury, liquidity, tokenomics, and market intelligence.",
};

// Revalidate every 30 seconds on the server
export const revalidate = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gweiToLabel(bps: number) {
  return `${bps / 10000} %`;
}

function bpsLabel(bps: number) {
  return `${(bps / 100).toFixed(2)} %`;
}

function ghostWei(wei: string | bigint | number): string {
  const n = typeof wei === "bigint" ? wei : BigInt(String(wei));
  const whole = n / 1_000_000_000_000_000_000n;
  const frac  = Number((n % 1_000_000_000_000_000_000n) * 10000n / 1_000_000_000_000_000_000n) / 10000;
  return `${whole.toLocaleString()}.${String(frac.toFixed(4)).split(".")[1]} GHOST`;
}

function ts(epoch: number) {
  return new Date(epoch).toLocaleString();
}

const HEALTH_COLOR: Record<string, string> = {
  healthy:       "text-green-400",
  underutilized: "text-yellow-400",
  overutilized:  "text-orange-400",
  critically_low:"text-red-500",
  imbalanced:    "text-purple-400",
};

const VERDICT_COLOR: Record<string, string> = {
  pass:    "text-green-400",
  warning: "text-yellow-400",
  fail:    "text-red-500",
};

const SENTIMENT_COLOR: Record<string, string> = {
  strong_bullish: "text-green-300",
  bullish:        "text-green-500",
  neutral:        "text-gray-300",
  bearish:        "text-orange-400",
  strong_bearish: "text-red-400",
};

const PRIORITY_COLOR: Record<string, string> = {
  emergency: "text-red-400",
  high:      "text-orange-400",
  medium:    "text-yellow-400",
  low:       "text-gray-400",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "bg-red-900/60 border-red-700",
  warning:  "bg-yellow-900/60 border-yellow-700",
  info:     "bg-blue-900/60 border-blue-700",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function EconomyPage() {
  const [statusRaw, treasuryRaw, liquidityRaw, tokenomicsRaw, marketRaw, simRaw] =
    await Promise.all([
      fetchEieStatus(),
      fetchEieTreasury(),
      fetchEieLiquidity(),
      fetchEieTokenomics(),
      fetchEieMarket(),
      fetchEieSimHistory(20),
    ]);

  const treasury    = treasuryRaw;
  const liquidity   = liquidityRaw;
  const tokenomics  = tokenomicsRaw;
  const market      = marketRaw;
  const sim         = simRaw;

  const eieStatus = statusRaw as Record<string, unknown> | null;
  const eieLoopCount = eieStatus ? Number((eieStatus as any).eieLoopCount ?? 0) : 0;
  const sentiment = market?.sentiment ?? "neutral";
  const sentimentScore = market?.sentimentScore ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Economic Intelligence Engine</h1>
          <p className="text-gray-400 text-sm mt-1">
            Treasury · Liquidity · Tokenomics · Market · Simulation — GhostBrain EIE
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 uppercase tracking-widest">EIE Decisions Run</div>
          <div className="text-3xl font-mono font-bold text-purple-400">{eieLoopCount}</div>
        </div>
      </div>

      {/* ── Section 1: EIE Status ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">EIE Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Market Sentiment">
            <span className={`text-xl font-bold capitalize ${SENTIMENT_COLOR[sentiment] ?? "text-gray-300"}`}>
              {sentiment.replace(/_/g, " ")}
            </span>
            <div className="text-xs text-gray-500 mt-1">Score: {sentimentScore.toFixed(1)}</div>
          </StatCard>
          <StatCard label="Sim Pass Rate">
            {sim?.stats ? (
              <span className="text-xl font-bold text-green-400">
                {sim.stats.passRate.toFixed(1)}%
              </span>
            ) : <Unavail />}
            {sim?.stats && (
              <div className="text-xs text-gray-500 mt-1">
                {sim.stats.total} total · {sim.stats.fail} failed
              </div>
            )}
          </StatCard>
          <StatCard label="Active Arb Signals">
            <span className="text-xl font-bold text-yellow-400">
              {market?.arbitrageSignals?.length ?? 0}
            </span>
          </StatCard>
          <StatCard label="Active Alerts">
            <span className="text-xl font-bold text-red-400">
              {market?.activeAlerts?.length ?? 0}
            </span>
          </StatCard>
        </div>
      </section>

      {/* ── Section 2: Treasury Overview ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Treasury Overview</h2>
        {treasury?.state ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Allocated"><span className="font-mono text-sm">{ghostWei(treasury.state.totalAllocated)}</span></StatCard>
            <StatCard label="Pending Governance"><span className="font-mono text-sm text-orange-400">{ghostWei(treasury.state.pendingGovernance)}</span></StatCard>
            <StatCard label="Invested"><span className="font-mono text-sm text-blue-400">{ghostWei(treasury.state.investedWei)}</span></StatCard>
            <StatCard label="Revenue Accrued"><span className="font-mono text-sm text-green-400">{ghostWei(treasury.state.accruedRevenueWei)}</span></StatCard>
            <StatCard label="Executed This Epoch"><span className="font-mono text-sm">{ghostWei(treasury.state.executedThisEpoch)}</span></StatCard>
            <StatCard label="Open Grants"><span className="text-2xl font-bold">{treasury.state.openGrants}</span></StatCard>
            <StatCard label="Total Grant Value"><span className="font-mono text-sm text-purple-400">{ghostWei(treasury.state.totalGrantsWei)}</span></StatCard>
          </div>
        ) : <Unavail />}
      </section>

      {/* ── Section 3: Allocations ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Allocations</h2>
        {treasury?.allocations?.length ? (
          <TableWrapped>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <Th>ID</Th><Th>Purpose</Th><Th>Amount</Th><Th>Requester</Th><Th>Status</Th><Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {(treasury.allocations as EieTreasuryAllocation[]).slice(0, 20).map(a => (
                <tr key={a.id} className="border-t border-gray-800 text-sm">
                  <Td><span className="font-mono text-xs text-gray-500">{a.id.slice(0, 8)}…</span></Td>
                  <Td>{a.purpose.replace(/_/g, " ")}</Td>
                  <Td><span className="font-mono">{ghostWei(a.amountWei)}</span></Td>
                  <Td>{a.requester}</Td>
                  <Td>
                    <span className={
                      a.status === "executed" ? "text-green-400" :
                      a.status === "pending_governance" ? "text-orange-400" :
                      a.status === "rejected" ? "text-red-400" :
                      "text-gray-300"
                    }>{a.status.replace(/_/g, " ")}</span>
                  </Td>
                  <Td>{ts(a.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapped>
        ) : <Empty msg="No allocations recorded." />}
      </section>

      {/* ── Section 4: Grants ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Grants</h2>
        {treasury?.grants?.length ? (
          <TableWrapped>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <Th>Grantee</Th><Th>Purpose</Th><Th>Amount</Th><Th>Milestones</Th><Th>Disbursed</Th><Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {(treasury.grants as EieGrant[]).slice(0, 10).map(g => (
                <tr key={g.id} className="border-t border-gray-800 text-sm">
                  <Td>{g.grantee}</Td>
                  <Td>{g.purposeTag}</Td>
                  <Td><span className="font-mono">{ghostWei(g.amountWei)}</span></Td>
                  <Td>{g.completedMilestones.length}/{g.milestones.length}</Td>
                  <Td><span className={g.disbursed ? "text-green-400" : "text-orange-400"}>{g.disbursed ? "Yes" : "Pending"}</span></Td>
                  <Td>{ts(g.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapped>
        ) : <Empty msg="No grants registered." />}
      </section>

      {/* ── Section 5: Investments ── */}
      {treasury?.investments?.length ? (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">Investment Positions</h2>
          <TableWrapped>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <Th>Protocol</Th><Th>Layer</Th><Th>Strategy</Th><Th>Principal</Th><Th>Current Value</Th><Th>APY</Th>
              </tr>
            </thead>
            <tbody>
              {(treasury.investments as EieInvestmentPosition[]).map(inv => (
                <tr key={inv.id} className="border-t border-gray-800 text-sm">
                  <Td>{inv.protocol}</Td>
                  <Td>{inv.layer}</Td>
                  <Td>{inv.strategy}</Td>
                  <Td><span className="font-mono">{ghostWei(inv.principalWei)}</span></Td>
                  <Td><span className="font-mono">{ghostWei(inv.currentValueWei)}</span></Td>
                  <Td>{bpsLabel(inv.apyBps)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapped>
        </section>
      ) : null}

      {/* ── Section 6: Liquidity Pools ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Liquidity Pools</h2>
        {liquidity?.pools?.length ? (
          <TableWrapped>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <Th>Pool</Th><Th>Chain</Th><Th>Type</Th><Th>TVL</Th><Th>Utilization</Th><Th>APY</Th><Th>Health</Th>
              </tr>
            </thead>
            <tbody>
              {(liquidity.pools as EieLiquidityPool[]).map(p => (
                <tr key={p.id} className="border-t border-gray-800 text-sm">
                  <Td>{p.name}</Td>
                  <Td>{p.chain}</Td>
                  <Td>{p.type}</Td>
                  <Td><span className="font-mono">{ghostWei(p.tvlWei)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-700 rounded">
                        <div className="h-1.5 rounded bg-blue-400" style={{ width: `${Math.min(p.utilizationPct, 100)}%` }} />
                      </div>
                      <span>{p.utilizationPct.toFixed(1)}%</span>
                    </div>
                  </Td>
                  <Td>{bpsLabel(p.apyBps)}</Td>
                  <Td><span className={HEALTH_COLOR[p.health] ?? "text-gray-300"}>{p.health.replace(/_/g, " ")}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapped>
        ) : <Unavail />}
        {liquidity && (
          <div className="mt-2 text-xs text-gray-500">
            Total TVL: {ghostWei(liquidity.totalTvlWei)} · Avg Utilization: {liquidity.avgUtilizationPct.toFixed(1)}%
          </div>
        )}
      </section>

      {/* ── Section 7: Active Strategies ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Active Liquidity Strategies</h2>
        {liquidity?.activeStrategies?.length ? (
          <TableWrapped>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <Th>Pool</Th><Th>Action</Th><Th>Amount</Th><Th>Priority</Th><Th>Reason</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(liquidity.activeStrategies as EieLiquidityStrategy[]).map(s => (
                <tr key={s.id} className="border-t border-gray-800 text-sm">
                  <Td>{s.poolName}</Td>
                  <Td>{s.action}</Td>
                  <Td><span className="font-mono">{ghostWei(s.amountWei)}</span></Td>
                  <Td><span className={PRIORITY_COLOR[s.priority] ?? "text-gray-300"}>{s.priority}</span></Td>
                  <Td>{s.reason}</Td>
                  <Td>{s.status}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapped>
        ) : <Empty msg="No active strategies queued." />}
      </section>

      {/* ── Section 8: Tokenomics ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Tokenomics</h2>
        {tokenomics?.current ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard label="Base Fee">
              <span className="text-xl font-bold">{tokenomics.current.baseFeeGwei} Gwei</span>
              <div className="text-xs text-gray-500">{tokenomics.bounds?.baseFeeGwei.min}–{tokenomics.bounds?.baseFeeGwei.max} Gwei</div>
            </StatCard>
            <StatCard label="Burn Rate">
              <span className="text-xl font-bold">{bpsLabel(tokenomics.current.burnRateBps)}</span>
              <div className="text-xs text-gray-500">{bpsLabel(tokenomics.bounds?.burnRateBps.min ?? 0)}–{bpsLabel(tokenomics.bounds?.burnRateBps.max ?? 0)}</div>
            </StatCard>
            <StatCard label="Validator Reward">
              <span className="text-xl font-bold">{bpsLabel(tokenomics.current.validatorRewardBps)}</span>
            </StatCard>
            <StatCard label="Staking Incentive">
              <span className="text-xl font-bold">{bpsLabel(tokenomics.current.stakingIncentiveBps)}</span>
            </StatCard>
            <StatCard label="Reserve Ratio">
              <span className="text-xl font-bold">{tokenomics.current.reserveRatioPct}%</span>
            </StatCard>
          </div>
        ) : <Unavail />}

        {tokenomics?.burnSchedule?.length ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-2">30-Day Burn Schedule</h3>
            <TableWrapped>
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <Th>Day</Th><Th>Date</Th><Th>Daily Burn (GHOST)</Th><Th>Cumulative (GHOST)</Th>
                </tr>
              </thead>
              <tbody>
                {(tokenomics.burnSchedule as EieBurnProjection[]).filter((_, i) => i % 5 === 0 || i === 0 || i === 29).map(b => (
                  <tr key={b.day} className="border-t border-gray-800 text-sm">
                    <Td>Day {b.day}</Td>
                    <Td>{b.date}</Td>
                    <Td><span className="font-mono">{b.estimatedBurnGhost.toFixed(2)}</span></Td>
                    <Td><span className="font-mono text-orange-400">{b.cumulativeBurnGhost.toFixed(2)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapped>
          </div>
        ) : null}

        {tokenomics?.history?.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Recent Optimization History</h3>
            <div className="space-y-2">
              {(tokenomics.history as EieOptimizationRecord[]).slice(0, 5).map(h => (
                <div key={h.id} className="bg-gray-900 rounded p-3 text-xs border border-gray-800">
                  <div className="flex items-center gap-3">
                    <span className={h.requiresGovernance ? "text-orange-400" : h.applied ? "text-green-400" : "text-gray-400"}>
                      {h.requiresGovernance ? "Governance Required" : h.applied ? "Applied" : "Not Applied"}
                    </span>
                    <span className="text-gray-500">{ts(h.timestamp)}</span>
                  </div>
                  <div className="text-gray-400 mt-1">{h.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Section 9: Market Intelligence ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Market Intelligence</h2>
        {market ? (
          <>
            <div className="flex items-center gap-4 mb-4">
              <span className={`text-2xl font-bold capitalize ${SENTIMENT_COLOR[market.sentiment] ?? "text-gray-300"}`}>
                {market.sentiment.replace(/_/g, " ")}
              </span>
              <span className="text-gray-500">sentiment score: {market.sentimentScore.toFixed(1)}</span>
            </div>
            {market.latestTicks?.length ? (
              <TableWrapped className="mb-4">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <Th>Pair</Th><Th>Price (USD)</Th><Th>24h Change</Th><Th>Volume 24h</Th><Th>Source</Th>
                  </tr>
                </thead>
                <tbody>
                  {(market.latestTicks as EieMarketTick[]).map(t => (
                    <tr key={t.pair} className="border-t border-gray-800 text-sm">
                      <Td><span className="font-mono font-semibold">{t.pair}</span></Td>
                      <Td><span className="font-mono">${t.priceUsd.toFixed(4)}</span></Td>
                      <Td>
                        <span className={t.change24hPct >= 0 ? "text-green-400" : "text-red-400"}>
                          {t.change24hPct >= 0 ? "▲" : "▼"} {Math.abs(t.change24hPct).toFixed(2)}%
                        </span>
                      </Td>
                      <Td><span className="font-mono">${t.volume24h.toLocaleString()}</span></Td>
                      <Td><span className="text-gray-500 text-xs">{t.source}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapped>
            ) : null}

            {market.activeAlerts?.length ? (
              <div className="space-y-2">
                {(market.activeAlerts as EieMarketAlert[]).map(a => (
                  <div key={a.id} className={`rounded border p-3 text-sm ${SEVERITY_COLOR[a.severity] ?? "bg-gray-900 border-gray-700"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{a.pair} — {a.type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-gray-400">{ts(a.timestamp)}</span>
                    </div>
                    <div className="text-gray-300 text-xs mt-1">{a.message}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm text-gray-500">No active market alerts.</div>}
          </>
        ) : <Unavail />}
      </section>

      {/* ── Section 10: Simulation Lab ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Simulation Lab</h2>
        {sim?.stats ? (
          <>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <StatCard label="Total Simulations"><span className="text-2xl font-bold">{sim.stats.total}</span></StatCard>
              <StatCard label="Pass"><span className="text-2xl font-bold text-green-400">{sim.stats.pass}</span></StatCard>
              <StatCard label="Fail"><span className="text-2xl font-bold text-red-400">{sim.stats.fail}</span></StatCard>
              <StatCard label="Warning"><span className="text-2xl font-bold text-yellow-400">{sim.stats.warning}</span></StatCard>
            </div>
            {sim.history?.length ? (
              <TableWrapped>
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <Th>Scenario</Th><Th>Strategy</Th><Th>Verdict</Th><Th>Recommendation</Th><Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {(sim.history as EieSimResult[]).map(r => (
                    <tr key={r.id} className="border-t border-gray-800 text-sm">
                      <Td>{r.scenarioType.replace(/_/g, " ")}</Td>
                      <Td>{r.strategyName}</Td>
                      <Td><span className={VERDICT_COLOR[r.verdict] ?? "text-gray-300"}>{r.verdict.toUpperCase()}</span></Td>
                      <Td className="max-w-xs"><span className="text-xs text-gray-400 truncate block" title={r.recommendation}>{r.recommendation}</span></Td>
                      <Td>{ts(r.timestamp)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapped>
            ) : <Empty msg="No simulations in history." />}
          </>
        ) : <Unavail />}
      </section>

      {/* ── Section 11: API Reference ── */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">API Reference</h2>
        <div className="text-xs text-gray-500 mb-2">Base: <code className="text-gray-300">http://ghostbrain-economic:9050</code></div>
        <div className="grid md:grid-cols-2 gap-3">
          {API_ENDPOINTS.map(e => (
            <div key={e.path} className="bg-gray-900 border border-gray-800 rounded p-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${e.method === "GET" ? "bg-blue-900 text-blue-300" : "bg-green-900 text-green-300"}`}>
                  {e.method}
                </span>
                <span className="font-mono text-sm text-gray-200">{e.path}</span>
              </div>
              <div className="text-gray-500 text-xs mt-1">{e.desc}</div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">{label}</div>
      {children}
    </div>
  );
}

function TableWrapped({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-gray-800 ${className}`}>
      <table className="w-full text-left">{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-gray-500 text-xs uppercase tracking-wide">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function Unavail() {
  return <p className="text-sm text-gray-600 italic">Service unreachable — data unavailable.</p>;
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-gray-600 italic">{msg}</p>;
}

// ─── API Endpoint Catalogue ───────────────────────────────────────────────────

const API_ENDPOINTS = [
  // EIE
  { method: "GET",  path: "/health",                   desc: "Liveness probe" },
  { method: "GET",  path: "/eie/status",               desc: "Full EIE status snapshot (treasury, liquidity, tokenomics, market, sim stats)" },
  { method: "GET",  path: "/economic-status",          desc: "Latest 5-min telemetry cycle snapshot" },
  { method: "POST", path: "/economic-check",           desc: "Manually trigger economic telemetry cycle" },
  // Treasury
  { method: "GET",  path: "/treasury",                 desc: "Treasury state, allocations, grants, investments" },
  { method: "POST", path: "/treasury/allocate",        desc: "Request a treasury allocation {purpose, amountWei, requester, rationale}" },
  { method: "POST", path: "/treasury/approve/:id",     desc: "Approve a pending allocation {approver}" },
  { method: "POST", path: "/treasury/execute/:id",     desc: "Execute an approved allocation" },
  { method: "POST", path: "/treasury/grant",           desc: "Register a grant {grantee, purposeTag, amountWei, approvedBy, milestones[]}" },
  { method: "POST", path: "/treasury/route",           desc: "Route funds cross-layer {from, to, amountWei, reason}" },
  // Liquidity
  { method: "GET",  path: "/liquidity",                desc: "Full liquidity report (pools, strategies, arbitrage)" },
  { method: "GET",  path: "/liquidity/strategies",     desc: "Active strategies and pool list" },
  { method: "POST", path: "/liquidity/deploy",         desc: "Deploy liquidity to a pool {poolId, amountWei, reason}" },
  // Tokenomics
  { method: "GET",  path: "/tokenomics",               desc: "Current params, bounds, 30-day burn schedule, optimization history" },
  { method: "POST", path: "/tokenomics/optimize",      desc: "Run tokenomics optimization {apply?: boolean}" },
  { method: "POST", path: "/tokenomics/apply",         desc: "Force-apply tokenomics params {params, reason}" },
  // Market
  { method: "GET",  path: "/market",                   desc: "Full market report (prices, volatility, sentiment, alerts)" },
  { method: "GET",  path: "/market/alerts",            desc: "Active market alerts" },
  { method: "GET",  path: "/market/history/:pair",     desc: "Tick history + volatility for a pair. ?limit=50" },
  // Simulation
  { method: "POST", path: "/simulate",                 desc: "Run full simulation suite {strategy, ...params}" },
  { method: "POST", path: "/simulate/liquidity",       desc: "Simulate liquidity injection {pool, amountUsd, currentLiquidityUsd, utilizationPct}" },
  { method: "POST", path: "/simulate/burn",            desc: "Simulate burn rate change {newBps, currentBps, dailyTx, avgValue}" },
  { method: "POST", path: "/simulate/validator",       desc: "Simulate validator reward change {newBps, currentBps, validators, stakedPct}" },
  { method: "POST", path: "/simulate/stress",          desc: "Simulate market stress {volatilityPct, treasuryUsd, bufferUsd}" },
  { method: "GET",  path: "/simulate/history",         desc: "Simulation history + stats. ?limit=20" },
];

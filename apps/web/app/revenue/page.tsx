"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAreSummary, fetchAreLoopStatus,
  fetchAreDefiPools, fetchAreDefiStats,
  fetchAreValidators, fetchAreValidatorStats,
  fetchAreTradingStrategies, fetchAreTradingStats,
  fetchAreComputeJobs, fetchAreMarketplaceStats,
  fetchAreSaaSClients, fetchAreSaaSStats,
  fetchAreTreasury, fetchAreTreasuryStats,
  fetchAreDistributions,
  AreLiquidityPool, AreValidator, AreTradingStrategy,
  AreComputeJob, AreSaaSClient, AreTreasury, AreDistribution,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function StatCard({ label, value, sub, color = "text-cyan-400" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${color}`}>{text}</span>;
}

function poolBadge(state: string) {
  const cls: Record<string, string> = { active: "bg-green-900 text-green-300", paused: "bg-gray-700 text-gray-400", rebalancing: "bg-blue-900 text-blue-300", draining: "bg-orange-900 text-orange-300" };
  return <Badge text={state} color={cls[state] ?? "bg-gray-700 text-gray-300"} />;
}
function valBadge(status: string) {
  const cls: Record<string, string> = { active: "bg-green-900 text-green-300", jailed: "bg-red-900 text-red-300", unbonding: "bg-yellow-900 text-yellow-300", inactive: "bg-gray-700 text-gray-400" };
  return <Badge text={status} color={cls[status] ?? "bg-gray-700 text-gray-300"} />;
}
function stratBadge(status: string) {
  const cls: Record<string, string> = { running: "bg-green-900 text-green-300", paused: "bg-yellow-900 text-yellow-300", stopped: "bg-gray-700 text-gray-400", backtesting: "bg-purple-900 text-purple-300" };
  return <Badge text={status} color={cls[status] ?? "bg-gray-700 text-gray-300"} />;
}
function jobBadge(state: string) {
  const cls: Record<string, string> = { queued: "bg-blue-900 text-blue-300", processing: "bg-cyan-900 text-cyan-300", complete: "bg-green-900 text-green-300", failed: "bg-red-900 text-red-300", cancelled: "bg-gray-700 text-gray-400" };
  return <Badge text={state} color={cls[state] ?? "bg-gray-700 text-gray-300"} />;
}
function saasBadge(status: string) {
  const cls: Record<string, string> = { active: "bg-green-900 text-green-300", trial: "bg-blue-900 text-blue-300", suspended: "bg-red-900 text-red-300", cancelled: "bg-gray-700 text-gray-400" };
  return <Badge text={status} color={cls[status] ?? "bg-gray-700 text-gray-300"} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RevenuePage() {
  const [loop,       setLoop]      = useState<Record<string, unknown> | null>(null);
  const [summary,    setSummary]   = useState<Record<string, unknown> | null>(null);
  const [pools,      setPools]     = useState<AreLiquidityPool[]>([]);
  const [defiStats,  setDefiStats] = useState<Record<string, unknown> | null>(null);
  const [validators, setVals]      = useState<AreValidator[]>([]);
  const [valStats,   setValStats]  = useState<Record<string, unknown> | null>(null);
  const [strategies, setStrats]    = useState<AreTradingStrategy[]>([]);
  const [tradStats,  setTradStats] = useState<Record<string, unknown> | null>(null);
  const [jobs,       setJobs]      = useState<AreComputeJob[]>([]);
  const [mktStats,   setMktStats]  = useState<Record<string, unknown> | null>(null);
  const [clients,    setClients]   = useState<AreSaaSClient[]>([]);
  const [saasStats,  setSaasStats] = useState<Record<string, unknown> | null>(null);
  const [treasury,   setTreasury]  = useState<AreTreasury | null>(null);
  const [tStats,     setTStats]    = useState<Record<string, unknown> | null>(null);
  const [dists,      setDists]     = useState<AreDistribution[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [lastRefresh,setLast]      = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [l, s, p, ds, v, vs, str, ts, j, ms, c, ss, t, tst, d] = await Promise.all([
      fetchAreLoopStatus(), fetchAreSummary(),
      fetchAreDefiPools(), fetchAreDefiStats(),
      fetchAreValidators(), fetchAreValidatorStats(),
      fetchAreTradingStrategies(), fetchAreTradingStats(),
      fetchAreComputeJobs(), fetchAreMarketplaceStats(),
      fetchAreSaaSClients(), fetchAreSaaSStats(),
      fetchAreTreasury(), fetchAreTreasuryStats(),
      fetchAreDistributions(),
    ]);
    setLoop(l); setSummary(s);
    setPools(p ?? []); setDefiStats(ds);
    setVals(v ?? []); setValStats(vs);
    setStrats(str ?? []); setTradStats(ts);
    setJobs(j ?? []); setMktStats(ms);
    setClients(c ?? []); setSaasStats(ss);
    setTreasury(t); setTStats(tst);
    setDists(d ?? []);
    setLoading(false); setLast(new Date());
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const sumDefi   = (summary?.defi    as Record<string, number> | null);
  const sumTrd    = (summary?.trading  as Record<string, number> | null);
  const sumSaas   = (summary?.saas    as Record<string, number> | null);
  const sumTreas  = (summary?.treasury as Record<string, number> | null);

  if (loading) return <div className="p-8 text-gray-400">Loading Autonomous Revenue Engine…</div>;

  return (
    <div className="p-6 space-y-6 text-gray-100 min-h-screen" style={{ background: "var(--background, #0d0d0d)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">💰 Autonomous Revenue Engine</h1>
          <p className="text-gray-400 text-sm mt-1">GhostBrain self-sustaining revenue — DeFi · Trading · SaaS · Compute · Treasury</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Cycle #{(loop?.cycleCount as number) ?? 0}</div>
          {lastRefresh && <div>Updated {lastRefresh.toLocaleTimeString()}</div>}
          <button onClick={load} className="mt-1 text-green-400 hover:text-green-300">↻ Refresh</button>
        </div>
      </div>

      {/* ── Ecosystem Revenue KPIs ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">Ecosystem Revenue Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Treasury Balance"   value={usd(treasury?.totalUSD ?? 0)} sub={`${treasury?.totalGST?.toLocaleString()} GST`} color="text-yellow-400" />
          <StatCard label="GST Price"          value={`$${treasury?.gstPriceUSD?.toFixed(4) ?? "--"}`} sub="USD / GST" color="text-green-400" />
          <StatCard label="Revenue 24h"        value={usd((sumTreas?.revenue24hUSD as number) ?? 0)} sub="all sources" color="text-cyan-400" />
          <StatCard label="Revenue 7d"         value={usd((sumTreas?.revenue7dUSD as number) ?? 0)} sub="all sources" color="text-purple-400" />
          <StatCard label="DeFi TVL"           value={usd((sumDefi?.totalTvlUSD as number) ?? 0)} sub={`${sumDefi?.activePools ?? 0} active pools`} color="text-blue-400" />
          <StatCard label="Trading P&L"        value={usd((sumTrd?.totalPnlUSD as number) ?? 0)} sub={`${sumTrd?.runningStrategies ?? 0} strategies`} color={(sumTrd?.totalPnlUSD as number) >= 0 ? "text-green-400" : "text-red-400"} />
          <StatCard label="SaaS Monthly Rev."  value={usd((sumSaas?.monthlyRevenueUSD as number) ?? 0)} sub={`${sumSaas?.activeClients ?? 0} clients`} color="text-orange-400" />
          <StatCard label="Pending Distribution" value={usd((sumTreas?.accumulatedPendingUSD as number) ?? 0)} sub="auto-distributes at $10K" color="text-pink-400" />
        </div>
      </section>

      {/* ── DeFi Liquidity Pools ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">DeFi Liquidity Pools ({pools.length})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total TVL"       value={usd((defiStats?.totalTvlUSD as number) ?? 0)} color="text-blue-400" />
          <StatCard label="24h Volume"      value={usd((defiStats?.totalVolume24hUSD as number) ?? 0)} color="text-cyan-400" />
          <StatCard label="24h Fees"        value={usd((defiStats?.totalFees24hUSD as number) ?? 0)} color="text-green-400" />
          <StatCard label="Avg APR"         value={`${((defiStats?.avgApr as number) ?? 0).toFixed(1)}%`} color="text-yellow-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Pair</th>
              <th className="text-left py-1 pr-3">Chain</th>
              <th className="text-left py-1 pr-3">State</th>
              <th className="text-right py-1 pr-3">TVL</th>
              <th className="text-right py-1 pr-3">APR</th>
              <th className="text-right py-1 pr-3">24h Vol</th>
              <th className="text-right py-1">24h Fees</th>
            </tr></thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-200">{p.pair}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{p.chain}</td>
                  <td className="py-1.5 pr-3">{poolBadge(p.state)}</td>
                  <td className="py-1.5 pr-3 text-right text-blue-300">{usd(p.tvlUSD)}</td>
                  <td className="py-1.5 pr-3 text-right text-yellow-300">{p.apr.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 text-right text-gray-400">{usd(p.volume24hUSD)}</td>
                  <td className="py-1.5 text-right text-green-400">{usd(p.fees24hUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Validators ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">Validator Rewards ({validators.length} validators)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Active Validators" value={String((valStats?.active as number) ?? 0)} color="text-green-400" />
          <StatCard label="Total Stake"       value={`${((valStats?.totalStakeGST as number) ?? 0).toLocaleString()} GST`} color="text-blue-400" />
          <StatCard label="Pending Rewards"   value={`${((valStats?.totalPendingGST as number) ?? 0).toFixed(0)} GST`} color="text-yellow-400" />
          <StatCard label="Avg Performance"   value={`${((valStats?.avgPerformancePct as number) ?? 0).toFixed(1)}%`} color="text-cyan-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Address</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-right py-1 pr-3">Stake (GST)</th>
              <th className="text-right py-1 pr-3">Pending</th>
              <th className="text-right py-1 pr-3">Total Earned</th>
              <th className="text-right py-1 pr-3">Perf%</th>
              <th className="text-right py-1">Commission</th>
            </tr></thead>
            <tbody>
              {validators.map((v) => (
                <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-400 text-xs">{v.address.slice(0, 12)}…</td>
                  <td className="py-1.5 pr-3">{valBadge(v.status)}</td>
                  <td className="py-1.5 pr-3 text-right text-blue-300">{v.stake.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-yellow-300">{v.pendingRewards.toFixed(1)}</td>
                  <td className="py-1.5 pr-3 text-right text-green-300">{v.totalEarned.toLocaleString()}</td>
                  <td className={`py-1.5 pr-3 text-right ${v.performancePct > 95 ? "text-green-400" : v.performancePct > 85 ? "text-yellow-400" : "text-red-400"}`}>{v.performancePct.toFixed(1)}%</td>
                  <td className="py-1.5 text-right text-gray-400">{v.commission}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Trading Strategies ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">Trading Engine ({strategies.length} strategies)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Running"      value={String((tradStats?.runningStrategies as number) ?? 0)} color="text-green-400" />
          <StatCard label="Total P&L"    value={usd((tradStats?.totalPnlUSD as number) ?? 0)} color={(tradStats?.totalPnlUSD as number) >= 0 ? "text-green-400" : "text-red-400"} />
          <StatCard label="Capital"      value={usd((tradStats?.totalCapitalUSD as number) ?? 0)} color="text-blue-400" />
          <StatCard label="Avg Win Rate" value={`${((tradStats?.avgWinRate as number) ?? 0).toFixed(1)}%`} color="text-cyan-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Strategy</th>
              <th className="text-left py-1 pr-3">Type</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-right py-1 pr-3">P&L</th>
              <th className="text-right py-1 pr-3">P&L%</th>
              <th className="text-right py-1 pr-3">Trades</th>
              <th className="text-right py-1 pr-3">Win%</th>
              <th className="text-right py-1">Capital</th>
            </tr></thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 text-gray-200">{s.name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{s.type}</td>
                  <td className="py-1.5 pr-3">{stratBadge(s.status)}</td>
                  <td className={`py-1.5 pr-3 text-right ${s.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{usd(s.pnlUSD)}</td>
                  <td className={`py-1.5 pr-3 text-right ${s.pnlPct >= 0 ? "text-green-300" : "text-red-300"}`}>{s.pnlPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 text-right text-gray-400">{s.totalTrades.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-cyan-300">{s.winRate.toFixed(1)}%</td>
                  <td className="py-1.5 text-right text-blue-400">{usd(s.capitalAllocatedUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Compute Marketplace ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">AI Compute Marketplace ({jobs.length} jobs)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Active Jobs"     value={String((mktStats?.activeJobs as number) ?? 0)} color="text-cyan-400" />
          <StatCard label="Queued"          value={String((mktStats?.queuedJobs as number) ?? 0)} color="text-blue-400" />
          <StatCard label="Total Revenue"   value={`${((mktStats?.totalRevenueGST as number) ?? 0).toLocaleString()} GST`} color="text-green-400" />
          <StatCard label="GPU Cores Active" value={String((mktStats?.totalGpuAllocated as number) ?? 0)} color="text-purple-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Type</th>
              <th className="text-left py-1 pr-3">Client</th>
              <th className="text-left py-1 pr-3">State</th>
              <th className="text-right py-1 pr-3">GPUs</th>
              <th className="text-right py-1 pr-3">Cost (GST)</th>
              <th className="text-right py-1">Progress</th>
            </tr></thead>
            <tbody>
              {jobs.slice(0, 12).map((j) => (
                <tr key={j.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-300">{j.type}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{j.client}</td>
                  <td className="py-1.5 pr-3">{jobBadge(j.state)}</td>
                  <td className="py-1.5 pr-3 text-right text-purple-400">{j.gpuCount}</td>
                  <td className="py-1.5 pr-3 text-right text-yellow-300">{j.costGST.toLocaleString()}</td>
                  <td className="py-1.5 text-right">
                    {j.state === "processing" ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-700 rounded h-1.5">
                          <div className="bg-cyan-500 h-1.5 rounded" style={{ width: `${j.progress}%` }} />
                        </div>
                        <span className="text-cyan-300">{j.progress}%</span>
                      </div>
                    ) : <span className={j.state === "complete" ? "text-green-400" : "text-gray-500"}>{j.state === "complete" ? "✓" : "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Blockchain SaaS ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">Blockchain SaaS ({clients.length} clients)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Active Clients"   value={String((saasStats?.activeClients as number) ?? 0)} color="text-green-400" />
          <StatCard label="Monthly Revenue"  value={usd((saasStats?.monthlyRevenueUSD as number) ?? 0)} color="text-yellow-400" />
          <StatCard label="Annual Revenue"   value={usd((saasStats?.annualRevenueUSD as number) ?? 0)} color="text-orange-400" />
          <StatCard label="Avg Uptime"       value={`${((saasStats?.avgUptimePct as number) ?? 0).toFixed(2)}%`} color="text-cyan-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Client</th>
              <th className="text-left py-1 pr-3">Service</th>
              <th className="text-left py-1 pr-3">Chain</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-right py-1 pr-3">Monthly</th>
              <th className="text-right py-1 pr-3">Nodes</th>
              <th className="text-right py-1">Uptime</th>
            </tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 text-gray-200">{c.name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{c.service}</td>
                  <td className="py-1.5 pr-3 font-mono text-gray-400">{c.chain}</td>
                  <td className="py-1.5 pr-3">{saasBadge(c.status)}</td>
                  <td className="py-1.5 pr-3 text-right text-yellow-300">{usd(c.monthlyFeeUSD)}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-400">{c.nodes}</td>
                  <td className={`py-1.5 text-right ${c.uptimePct > 99 ? "text-green-400" : c.uptimePct > 95 ? "text-yellow-400" : "text-red-400"}`}>{c.uptimePct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Treasury ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">GhostChain Treasury & Distribution</h2>
        {treasury && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total Treasury"  value={usd(treasury.totalUSD)} color="text-yellow-400" />
            <StatCard label="Operational"     value={usd(treasury.reserves.operationalUSD)} color="text-blue-400" />
            <StatCard label="Development"     value={usd(treasury.reserves.developmentUSD)} color="text-purple-400" />
            <StatCard label="Emergency Fund"  value={usd(treasury.reserves.emergencyUSD)} color="text-red-400" />
          </div>
        )}
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Distribution History (40% Treasury · 30% Validators · 30% Ecosystem)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-right py-1 pr-3">Total</th>
              <th className="text-right py-1 pr-3">Treasury (40%)</th>
              <th className="text-right py-1 pr-3">Validators (30%)</th>
              <th className="text-right py-1 pr-3">Ecosystem (30%)</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-left py-1">Tx Hash</th>
            </tr></thead>
            <tbody>
              {dists.slice(-10).reverse().map((d) => (
                <tr key={d.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 text-gray-400">{new Date(d.timestamp).toLocaleDateString()}</td>
                  <td className="py-1.5 pr-3 text-right text-yellow-300">{usd(d.totalUSD)}</td>
                  <td className="py-1.5 pr-3 text-right text-blue-300">{usd(d.treasuryUSD)}</td>
                  <td className="py-1.5 pr-3 text-right text-green-300">{usd(d.validatorsUSD)}</td>
                  <td className="py-1.5 pr-3 text-right text-purple-300">{usd(d.ecosystemUSD)}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-xs ${d.status === "executed" ? "text-green-400" : d.status === "pending" ? "text-yellow-400" : "text-red-400"}`}>{d.status}</span>
                  </td>
                  <td className="py-1.5 font-mono text-gray-500">{d.txHash.slice(0, 14)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

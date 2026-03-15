/**
 * GIE-X — Ghost Interchain Expansion Engine
 * Dashboard page – server-rendered, revalidates every 30 s
 */

import { Suspense } from "react";
import {
  fetchGiexHealth,
  fetchGiexChains,
  fetchGiexBridges,
  fetchGiexPools,
  fetchGiexAssets,
  fetchGiexMessages,
  fetchGiexSnapshot,
  fetchGiexChainPerformances,
  type GiexChain,
  type GiexBridge,
  type GiexPool,
  type GiexWrappedAsset,
  type GiexMessage,
  type GiexSnapshot,
  type GiexChainPerformance,
} from "@/lib/api";

export const revalidate = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}
function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function pct(n: number, digits = 1): string { return `${(n * 100).toFixed(digits)}%`; }

type BadgeVariant = "active" | "deploying" | "target" | "paused" | "failed" | "delivered" | "queued" | "relaying" | "timeout" | "other";

const BADGE: Record<BadgeVariant, string> = {
  active:    "bg-green-100  text-green-800  border-green-300",
  deploying: "bg-yellow-100 text-yellow-800 border-yellow-300",
  target:    "bg-blue-100   text-blue-800   border-blue-300",
  paused:    "bg-gray-100   text-gray-600   border-gray-300",
  failed:    "bg-red-100    text-red-800    border-red-300",
  delivered: "bg-green-100  text-green-800  border-green-300",
  queued:    "bg-indigo-100 text-indigo-700 border-indigo-300",
  relaying:  "bg-yellow-100 text-yellow-800 border-yellow-300",
  timeout:   "bg-red-100    text-red-800    border-red-300",
  other:     "bg-gray-100   text-gray-600   border-gray-300",
};
function Badge({ value }: { value: string }) {
  const cls = BADGE[(value as BadgeVariant)] ?? BADGE["other"];
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold leading-4 ${cls}`}>
      {value}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 rounded-full bg-gray-200 h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-600">{score}</span>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-start gap-3">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Health Bar ────────────────────────────────────────────────────────────────

function HealthBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-400" : "bg-red-400";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Degraded" : "Critical";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 rounded-full bg-gray-200 h-3">
        <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-700">{score}/100</span>
      <Badge value={label.toLowerCase()} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function InterchainPage() {
  const [health, chains, bridges, pools, assets, messages, snapshot, performances] = await Promise.all([
    fetchGiexHealth(),
    fetchGiexChains(),
    fetchGiexBridges(),
    fetchGiexPools(),
    fetchGiexAssets(),
    fetchGiexMessages({ limit: 20 }),
    fetchGiexSnapshot(),
    fetchGiexChainPerformances(),
  ]);

  const snap      = snapshot as GiexSnapshot | null;
  const chainList = (chains ?? []) as GiexChain[];
  const bridgeList= (bridges ?? []) as GiexBridge[];
  const poolList  = (pools ?? []) as GiexPool[];
  const assetList = (assets ?? []) as GiexWrappedAsset[];
  const msgList   = (messages ?? []) as GiexMessage[];
  const perfList  = (performances ?? []) as GiexChainPerformance[];

  const isOnline = health !== null;

  // summary stats
  const activeChains   = chainList.filter((c) => c.status === "active").length;
  const totalBridgeVol = bridgeList.reduce((s, b) => s + b.dailyVolume_USD, 0);
  const totalTVL       = poolList.reduce((s, p) => s + p.tvl_USD, 0);
  const totalHolders   = assetList.reduce((s, a) => s + a.holdersCount, 0);
  const healthScore    = snap?.interchainHealthScore ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🌐 Interchain Expansion Engine</h1>
          <p className="text-sm text-gray-500 mt-0.5">GIE-X — Autonomous multichain expansion for GhostStack</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-green-500" : "bg-red-400"}`} />
          <span className="text-sm font-medium text-gray-600">{isOnline ? "GIE-X online" : "GIE-X offline"}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon="⛓️"  label="Active Chains"      value={String(activeChains)}          sub={`of ${chainList.length} tracked`} />
        <KpiCard icon="🌉"  label="Bridge Vol (24h)"   value={fmtUSD(totalBridgeVol)}        sub={`${bridgeList.filter(b=>b.status==="active").length} active bridges`} />
        <KpiCard icon="💧"  label="Cross-Chain TVL"     value={fmtUSD(totalTVL)}              sub={`${poolList.length} pools`} />
        <KpiCard icon="👥"  label="wGST Holders"        value={fmt(totalHolders)}             sub={`${assetList.filter(a=>a.status==="active").length} networks live`} />
      </div>

      {/* Interchain Health */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Interchain Health</h2>
        <HealthBar score={healthScore} />
        {snap && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-500">Reach:</span> <strong>{snap.multiChainReach} chains</strong></div>
            <div><span className="text-gray-500">Ext. Liquidity:</span> <strong>{fmtUSD(snap.gstExternalLiquidity_USD)}</strong></div>
            <div><span className="text-gray-500">Msg Delivery:</span> <strong>{pct(snap.messaging.successRate ?? 0)}</strong></div>
            <div><span className="text-gray-500">Deploying:</span> <strong>{snap.discovery.deploying} chains</strong></div>
          </div>
        )}
      </div>

      {/* Connected Chains */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Connected Chains</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Chain", "Type", "Status", "Score", "Est. TVL", "Users", "Bridge", "Pools", "wGST", "Msgs"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {chainList.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">No chains discovered yet</td></tr>
              ) : chainList.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-900">{c.name} <span className="text-gray-400 text-xs">({c.symbol})</span></td>
                  <td className="px-3 py-2 text-gray-500 text-xs capitalize">{c.type}</td>
                  <td className="px-3 py-2"><Badge value={c.status} /></td>
                  <td className="px-3 py-2"><ScoreBar score={c.overallScore} /></td>
                  <td className="px-3 py-2 text-gray-700">{fmtUSD(c.estimatedTVL_USD)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(c.estimatedUsers)}</td>
                  <td className="px-3 py-2 text-center">{c.bridgeDeployed ? "✅" : "—"}</td>
                  <td className="px-3 py-2 text-center">{c.poolsDeployed}</td>
                  <td className="px-3 py-2 text-center">{c.wrappedAssets}</td>
                  <td className="px-3 py-2 text-center">{fmt(c.messagesRelayed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bridges */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Bridge Status</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Route", "Mode", "Status", "Daily Volume", "Total Volume", "Txns", "Success Rate", "Fee (bps)"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bridgeList.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No bridges deployed yet</td></tr>
              ) : bridgeList.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{b.source} → {b.destination}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{b.mode}</td>
                  <td className="px-3 py-2"><Badge value={b.status} /></td>
                  <td className="px-3 py-2 font-medium">{fmtUSD(b.dailyVolume_USD)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtUSD(b.totalVolume_USD)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmt(b.txCount)}</td>
                  <td className="px-3 py-2">
                    <span className={b.successRate >= 0.99 ? "text-green-600 font-semibold" : b.successRate >= 0.95 ? "text-yellow-600" : "text-red-600"}>
                      {pct(b.successRate, 2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{b.bridgeFee_bps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Liquidity Pools */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Liquidity Pools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {poolList.length === 0 ? (
            <p className="text-gray-400 col-span-3">No liquidity pools yet</p>
          ) : poolList.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800">{p.label}</span>
                <Badge value={p.status} />
              </div>
              <div className="text-xs text-gray-400 mb-2">{p.chain} · {p.protocol}</div>
              <div className="grid grid-cols-3 gap-1 text-sm">
                <div><p className="text-gray-400 text-xs">TVL</p><p className="font-bold">{fmtUSD(p.tvl_USD)}</p></div>
                <div><p className="text-gray-400 text-xs">APY</p><p className="font-bold text-green-600">{p.apy.toFixed(1)}%</p></div>
                <div><p className="text-gray-400 text-xs">Vol 24h</p><p className="font-bold">{fmtUSD(p.volume24h_USD)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Wrapped Assets */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Wrapped Assets (wGST)</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Network", "Standard", "Status", "Circ. Supply", "Holders", "Market Cap", "Price", "Peg Deviation"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assetList.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No wrapped assets yet</td></tr>
              ) : assetList.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{a.network}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{a.standard}</td>
                  <td className="px-3 py-2"><Badge value={a.status} /></td>
                  <td className="px-3 py-2">{fmt(Math.round(a.circulatingSupply / 1_000_000), 3)}M</td>
                  <td className="px-3 py-2">{fmt(a.holdersCount)}</td>
                  <td className="px-3 py-2 font-medium">{fmtUSD(a.marketCap_USD)}</td>
                  <td className="px-3 py-2 text-gray-600">${a.price_USD.toFixed(4)}</td>
                  <td className="px-3 py-2">
                    <span className={Math.abs(a.pegDeviation_pct) < 1 ? "text-green-600" : "text-red-600"}>
                      {a.pegDeviation_pct > 0 ? "+" : ""}{a.pegDeviation_pct.toFixed(3)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Chain Performances */}
      {perfList.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Chain Performance Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {perfList.map((p) => (
              <div key={p.chain} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800">{p.chain}</span>
                  <Badge value={p.healthStatus} />
                </div>
                <ScoreBar score={p.overallScore} />
                <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <div>Bridge Vol: <strong>{fmtUSD(p.bridgeVolume_USD)}</strong></div>
                  <div>Pool TVL: <strong>{fmtUSD(p.poolTVL_USD)}</strong></div>
                  <div>wGST MCap: <strong>{fmtUSD(p.wGSTMarketCap_USD)}</strong></div>
                  <div>Msgs: <strong>{fmt(p.messagesRelayed)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Messages */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Cross-Chain Messages</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Destination", "Type", "Protocol", "Status", "Gas Paid", "Time"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {msgList.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No messages yet</td></tr>
              ) : msgList.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{m.destination}</td>
                  <td className="px-3 py-2 text-gray-500 capitalize">{m.type.replace("-", " ")}</td>
                  <td className="px-3 py-2 font-mono text-xs text-indigo-600">{m.protocol}</td>
                  <td className="px-3 py-2"><Badge value={m.status} /></td>
                  <td className="px-3 py-2 text-gray-600">${m.gasPaid_USD.toFixed(3)}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 pb-4">
        GIE-X v1.0 · Data refreshes every 30 s · Engine port 9979
      </p>
    </div>
  );
}

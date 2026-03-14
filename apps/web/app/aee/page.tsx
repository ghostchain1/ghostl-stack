/**
 * aee/page.tsx — Autonomous Economy Engine (AEE) Dashboard
 *
 * Sections:
 *   1. Summary cards — treasury, burns, supply, liquidity, markets
 *   2. Treasury Allocations
 *   3. Token Supply Control
 *   4. Liquidity Pools
 *   5. Active Markets (TVL)
 *   6. Economic Simulation Result
 */

import type { Metadata } from "next";
import {
  fetchAeeHealth,
  fetchAeeSummary,
  fetchAeeTreasury,
  fetchAeeBurns,
  fetchAeeSupply,
  fetchAeeLiquidity,
  fetchAeeMarkets,
  fetchAeeSimulation,
  type AeeSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Economy Engine | GhostBrain",
  description: "GhostStack AEE — treasury intelligence, token burn/supply, market creation, and liquidity balancing.",
};

export const revalidate = 30;

interface TreasuryAllocation { department: string; pct: number; amount: number }
interface TreasuryState      { totalUSD: number; allocations: TreasuryAllocation[]; updatedAt: string }

interface BurnStats {
  totalBurned: number;
  eventCount:  number;
  recent:      { id: string; amount: number; trigger: string; burnedAt: string }[];
}

interface SupplyMetrics {
  circulatingSupply: number; dailyEmissions: number; dailyDemand: number;
  pressureRatio: number; action: string; lastUpdatedAt: string;
}

interface Pool { pair: string; dex: string; chain: string; tvl: number; apr: number; status: string }
interface LiquidityData { summary: { total: number; healthy: number; lowTVL: number; totalTVL: number; avgAPR: number }; pools: Pool[] }

interface Market { name: string; type: string; layer: string; tvl: number; status: string }
interface MarketData { total: number; live: number; totalTVL: number; markets: Market[] }

interface SimResult {
  summary: { finalPriceUSD: number; finalMarketCapUSD: number; finalTVLUSD: number; peakPriceUSD: number; minPriceUSD: number; totalBurned: number };
  snapshots: { day: number; priceUSD: number; marketCapUSD: number }[];
  params: { horizonDays: number; initialPriceUSD: number; dailyGrowthRate: number };
}

const ACTION_COLOR: Record<string, string> = {
  burn:                "text-red-400",
  "reduce-emissions":  "text-yellow-400",
  hold:                "text-green-400",
  "increase-emissions":"text-blue-400",
};

const POOL_STATUS: Record<string, string> = {
  healthy:      "bg-green-900/60 text-green-400",
  "low-tvl":    "bg-yellow-900/60 text-yellow-400",
  incentivised: "bg-blue-900/60 text-blue-400",
  critical:     "bg-red-900/60 text-red-400",
};

const MARKET_STATUS: Record<string, string> = {
  live:       "bg-green-900/60 text-green-400",
  building:   "bg-yellow-900/60 text-yellow-400",
  proposed:   "bg-gray-800 text-gray-400",
  deprecated: "bg-red-900/60 text-red-400",
};

function fmtUSD(n: number) { return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }

export default async function AeePage() {
  const [health, summary, treasuryRaw, burnsRaw, supplyRaw, liquidityRaw, marketsRaw, simRaw] = await Promise.all([
    fetchAeeHealth(),
    fetchAeeSummary(),
    fetchAeeTreasury(),
    fetchAeeBurns(),
    fetchAeeSupply(),
    fetchAeeLiquidity(),
    fetchAeeMarkets(),
    fetchAeeSimulation(),
  ]);

  const s         = summary   as AeeSummary   | null;
  const treasury  = treasuryRaw as TreasuryState | null;
  const burns     = burnsRaw  as BurnStats    | null;
  const supply    = supplyRaw as SupplyMetrics| null;
  const liq       = liquidityRaw as LiquidityData | null;
  const markets   = marketsRaw as MarketData  | null;
  const sim       = simRaw    as SimResult    | null;

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      <div>
        <h1 className="text-2xl font-bold mb-1">Autonomous Economy Engine</h1>
        <p style={{ color: "var(--fg-muted)" }}>Treasury intelligence, token burn/supply control, market creation, liquidity balancing, and economic simulation — fully autonomous.</p>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Treasury",      value: s ? fmtUSD(s.treasury.totalUSD) : "—",          sub: s ? `${s.treasury.departments} departments` : "" },
          { label: "Total Burned",  value: s ? s.burns.totalBurned.toLocaleString() + " GST" : "—", sub: s ? `${s.burns.events} events` : "" },
          { label: "Supply Action", value: s?.supply.action?.toUpperCase() ?? "—",          sub: s ? `ratio ${s.supply.pressureRatio.toFixed(2)}` : "", color: s ? ACTION_COLOR[s.supply.action] : "" },
          { label: "Liquidity TVL", value: s ? fmtUSD(s.liquidity.totalTVL) : "—",         sub: s ? `avg APR ${s.liquidity.avgAPR}%` : "" },
          { label: "Live Markets",  value: s ? String(s.markets.live) : "—",               sub: s ? fmtUSD(s.markets.totalTVL) + " TVL" : "" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Treasury Allocations ─────────────────────────────────────────── */}
      {treasury && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Treasury Allocations</h2>
            <span className="text-green-400 font-bold">{fmtUSD(treasury.totalUSD)}</span>
          </div>
          <div className="space-y-2">
            {treasury.allocations.map((a) => (
              <div key={a.department} className="flex items-center gap-3">
                <div className="w-28 text-xs" style={{ color: "var(--fg-muted)" }}>{a.department}</div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: "var(--accent)" }} />
                </div>
                <div className="text-xs w-8 text-right">{a.pct}%</div>
                <div className="text-xs w-20 text-right text-green-400">{fmtUSD(a.amount)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>Updated: {new Date(treasury.updatedAt).toLocaleString()}</p>
        </section>
      )}

      {/* ── Token Supply Control ─────────────────────────────────────────── */}
      {supply && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Token Supply Control</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Circulating Supply", value: supply.circulatingSupply.toLocaleString() + " GST" },
              { label: "Daily Emissions",    value: supply.dailyEmissions.toLocaleString() + " GST" },
              { label: "Daily Demand",       value: supply.dailyDemand.toLocaleString() + " GST" },
              { label: "Pressure Ratio",     value: supply.pressureRatio.toFixed(2) },
              { label: "AI Action",          value: supply.action.toUpperCase(), color: ACTION_COLOR[supply.action] },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
                <div className={`font-semibold ${color ?? ""}`}>{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Token Burns ──────────────────────────────────────────────────── */}
      {burns && burns.recent.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Token Burns</h2>
            <span className="text-red-400 font-bold">{burns.totalBurned.toLocaleString()} GST burned</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Amount", "Trigger", "Date"].map(h => <th key={h} className="text-left pb-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {burns.recent.slice(0, 8).map((b) => (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 text-red-400 font-medium">{b.amount.toLocaleString()} GST</td>
                    <td className="py-2 capitalize">{b.trigger.replace("-", " ")}</td>
                    <td className="py-2" style={{ color: "var(--fg-muted)" }}>{new Date(b.burnedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Liquidity Pools ──────────────────────────────────────────────── */}
      {liq && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Liquidity Pools</h2>
            <span className="font-bold text-green-400">{fmtUSD(liq.summary.totalTVL)} TVL</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Pair", "DEX", "Chain", "TVL", "APR", "Status"].map(h => <th key={h} className="text-left pb-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {liq.pools.map((p) => (
                  <tr key={p.pair} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{p.pair}</td>
                    <td className="py-2">{p.dex}</td>
                    <td className="py-2">{p.chain}</td>
                    <td className="py-2">{fmtUSD(p.tvl)}</td>
                    <td className="py-2 text-yellow-400">{p.apr.toFixed(1)}%</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${POOL_STATUS[p.status] ?? "bg-gray-800 text-gray-400"}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Active Markets ───────────────────────────────────────────────── */}
      {markets && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">DeFi Markets</h2>
            <span className="font-bold text-green-400">{fmtUSD(markets.totalTVL)} TVL</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {markets.markets.map((m) => (
              <div key={m.name} className="rounded border p-3 space-y-1" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">{m.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${MARKET_STATUS[m.status] ?? "bg-gray-800 text-gray-400"}`}>{m.status}</span>
                </div>
                <div className="text-xs capitalize" style={{ color: "var(--fg-muted)" }}>{m.type} · {m.layer}</div>
                {m.tvl > 0 && <div className="text-green-400 font-semibold text-xs">{fmtUSD(m.tvl)}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Economic Simulation ──────────────────────────────────────────── */}
      {sim && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Economic Simulation ({sim.params.horizonDays}d)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Start Price",   value: `$${sim.params.initialPriceUSD.toFixed(4)}` },
              { label: "Final Price",   value: `$${sim.summary.finalPriceUSD.toFixed(4)}`, color: sim.summary.finalPriceUSD > sim.params.initialPriceUSD ? "text-green-400" : "text-red-400" },
              { label: "Peak Price",    value: `$${sim.summary.peakPriceUSD.toFixed(4)}`, color: "text-yellow-400" },
              { label: "Market Cap",    value: fmtUSD(sim.summary.finalMarketCapUSD) },
              { label: "Final TVL",     value: fmtUSD(sim.summary.finalTVLUSD), color: "text-green-400" },
              { label: "Total Burned",  value: sim.summary.totalBurned.toLocaleString() + " GST", color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
                <div className={`font-semibold ${color ?? ""}`}>{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!health && !summary && (
        <div className="rounded-lg border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-red-400 font-semibold">Economy Engine is offline or unreachable on port 9974.</p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Start the service: cd services/ai-economy && npm start</p>
        </div>
      )}
    </div>
  );
}

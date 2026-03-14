/**
 * expansion/page.tsx — Global Expansion Engine (GEE) Dashboard
 *
 * Sections:
 *   1. Summary cards — exchanges, media, partnerships, regions, institutions, alliances
 *   2. Exchange Listing Status
 *   3. Regional Presence
 *   4. Ecosystem Alliances
 *   5. Partnership Pipeline
 */

import type { Metadata } from "next";
import {
  fetchGeeHealth,
  fetchGeeSummary,
  fetchGeeExchanges,
  fetchGeeRegions,
  fetchGeeAlliances,
  fetchGeePartnerships,
  type GeeSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Expansion Engine | GhostBrain",
  description: "GhostStack GEE — exchange listings, global partnerships, regional adoption, and ecosystem alliances.",
};

export const revalidate = 30;

interface Exchange {
  name: string; tier: number; volumeUSD24h: number; status: string; listingFee?: number;
}

interface Region {
  name: string; language: string; status: string;
  currentKPIs: { users: number; tvl: string; validators: number };
  targetKPIs:  { users: number; tvl: string; validators: number };
}

interface Alliance {
  chain: string; ecosystem: string; bridgeType: string; tvlTarget: string; status: string;
}

interface Partner {
  name: string; category: string; relevance: number; status: string; notes: string;
}

const STATUS_COLORS: Record<string, string> = {
  listed:      "bg-green-900/60 text-green-400",
  applied:     "bg-blue-900/60 text-blue-400",
  identified:  "bg-gray-800 text-gray-400",
  proposed:    "bg-yellow-900/60 text-yellow-400",
  building:    "bg-purple-900/60 text-purple-400",
  live:        "bg-green-900/60 text-green-400",
  active:      "bg-green-900/60 text-green-400",
  planning:    "bg-yellow-900/60 text-yellow-400",
  negotiating: "bg-blue-900/60 text-blue-400",
  integrated:  "bg-green-900/60 text-green-400",
};

export default async function ExpansionPage() {
  const [health, summary, exchangesRaw, regionsRaw, alliancesRaw, partnersRaw] = await Promise.all([
    fetchGeeHealth(),
    fetchGeeSummary(),
    fetchGeeExchanges(),
    fetchGeeRegions(),
    fetchGeeAlliances(),
    fetchGeePartnerships(),
  ]);

  const s          = summary as GeeSummary | null;
  const exchanges  = (exchangesRaw  as Exchange[])  ?? [];
  const regions    = (regionsRaw    as Region[])    ?? [];
  const alliances  = (alliancesRaw  as Alliance[])  ?? [];
  const partners   = (partnersRaw   as Partner[])   ?? [];

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      <div>
        <h1 className="text-2xl font-bold mb-1">Global Expansion Engine</h1>
        <p style={{ color: "var(--fg-muted)" }}>Autonomous exchange listings, media outreach, partnerships, regional growth, institutional integration, and ecosystem alliances.</p>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Exchanges",    value: s?.exchanges.listed?.toString() ?? "—",      sub: s ? `of ${s.exchanges.total} targeted` : "" },
          { label: "Media",        value: s?.media.releases?.toString()  ?? "—",       sub: "press releases" },
          { label: "Partnerships", value: s?.partnerships.deals?.toString() ?? "—",    sub: s ? `of ${s.partnerships.total} partners` : "" },
          { label: "Regions",      value: s?.regions.active?.toString()  ?? "—",       sub: s ? `of ${s.regions.total} live` : "" },
          { label: "Institutions", value: s?.institutions.contacted?.toString() ?? "—", sub: s ? `of ${s.institutions.total} targeted` : "" },
          { label: "Alliances",    value: s?.alliances.proposed?.toString() ?? "—",    sub: s ? `of ${s.alliances.total} chains` : "" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Exchange Listing Status ───────────────────────────────────────── */}
      {exchanges.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Exchange Listing Pipeline</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Exchange", "Tier", "24h Volume", "Listing Fee", "Status"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exchanges.map((ex) => (
                  <tr key={ex.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{ex.name}</td>
                    <td className="py-2">T{ex.tier}</td>
                    <td className="py-2">${(ex.volumeUSD24h / 1e9).toFixed(1)}B</td>
                    <td className="py-2">{ex.listingFee ? `$${ex.listingFee.toLocaleString()}` : "—"}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[ex.status] ?? "bg-gray-800 text-gray-400"}`}>
                        {ex.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Regional Presence ────────────────────────────────────────────── */}
      {regions.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Regional Presence</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regions.map((r) => (
              <div key={r.name} className="rounded border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] ?? "bg-gray-800 text-gray-400"}`}>{r.status}</span>
                </div>
                <div className="text-xs" style={{ color: "var(--fg-muted)" }}>{r.language}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div style={{ color: "var(--fg-muted)" }}>Users</div>
                    <div className="font-semibold">{r.currentKPIs.users.toLocaleString()}</div>
                    <div style={{ color: "var(--fg-muted)" }}>/ {r.targetKPIs.users.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--fg-muted)" }}>TVL</div>
                    <div className="font-semibold">{r.currentKPIs.tvl}</div>
                    <div style={{ color: "var(--fg-muted)" }}>/ {r.targetKPIs.tvl}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--fg-muted)" }}>Validators</div>
                    <div className="font-semibold">{r.currentKPIs.validators}</div>
                    <div style={{ color: "var(--fg-muted)" }}>/ {r.targetKPIs.validators}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Ecosystem Alliances ──────────────────────────────────────────── */}
      {alliances.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Ecosystem Alliances</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Chain", "Ecosystem", "Bridge Type", "TVL Target", "Status"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alliances.map((a) => (
                  <tr key={a.chain} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{a.chain}</td>
                    <td className="py-2">{a.ecosystem}</td>
                    <td className="py-2 capitalize">{a.bridgeType}</td>
                    <td className="py-2 text-green-400">{a.tvlTarget}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[a.status] ?? "bg-gray-800 text-gray-400"}`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Partnership Pipeline ─────────────────────────────────────────── */}
      {partners.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Partnership Pipeline</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Partner", "Category", "Relevance", "Status", "Notes"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partners.slice(0, 10).map((p) => (
                  <tr key={p.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 capitalize">{p.category}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                          <div className="h-full rounded-full" style={{ width: `${p.relevance}%`, background: "var(--accent)" }} />
                        </div>
                        <span>{p.relevance}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[p.status] ?? "bg-gray-800 text-gray-400"}`}>{p.status}</span>
                    </td>
                    <td className="py-2 truncate max-w-xs" style={{ color: "var(--fg-muted)" }}>{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!health && !summary && (
        <div className="rounded-lg border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-red-400 font-semibold">Expansion Engine is offline or unreachable on port 9973.</p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Start the service: cd services/ai-expansion && npm start</p>
        </div>
      )}
    </div>
  );
}

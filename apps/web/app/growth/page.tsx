/**
 * growth/page.tsx — Viral Growth Engine (VGE) Dashboard
 *
 * Sections:
 *   1. Engine Status      — health, service info
 *   2. Summary Metrics    — memes, campaigns, referrals, airdrops, token
 *   3. Viral Campaigns    — live campaign table with reach & engagement
 *   4. Token Metrics      — GST price, market cap, holders
 *   5. Top Memes          — meme gallery with viral scores
 *   6. Referral System    — referral leaderboard
 */

import type { Metadata } from "next";
import {
  fetchVgeHealth,
  fetchVgeSummary,
  fetchVgeCampaigns,
  fetchVgeMemes,
  fetchVgeTokenMetrics,
  fetchVgeReferrals,
  type VgeSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Viral Growth Engine | GhostBrain",
  description: "GhostStack VGE — memes, viral campaigns, airdrops, referrals, and token demand.",
};

export const revalidate = 30;

interface Campaign {
  id: string; title: string; platform: string; status: string;
  reach: number; engagement: number; viralScore: number; createdAt: string;
}

interface Meme {
  id: string; topic: string; viralScore: number; platform: string; createdAt: string;
}

interface TokenMetrics {
  price: number; marketCap: number; volume24h: number; holders: number; priceChange24h: number;
}

interface Referral {
  code: string; uses: number; totalRewards: number; createdAt: string;
}

export default async function GrowthPage() {
  const [health, summary, campaignsRaw, memesRaw, tokenRaw, referralsRaw] = await Promise.all([
    fetchVgeHealth(),
    fetchVgeSummary(),
    fetchVgeCampaigns(),
    fetchVgeMemes(),
    fetchVgeTokenMetrics(),
    fetchVgeReferrals(),
  ]);

  const s          = summary as VgeSummary | null;
  const campaigns  = (campaignsRaw as Campaign[]) ?? [];
  const memes      = (memesRaw   as Meme[])       ?? [];
  const token      = tokenRaw as TokenMetrics | null;
  const referrals  = (referralsRaw as Referral[]) ?? [];

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      <div>
        <h1 className="text-2xl font-bold mb-1">Viral Growth Engine</h1>
        <p style={{ color: "var(--fg-muted)" }}>Meme generation, influencer deals, airdrops, referral campaigns, and token demand — fully autonomous.</p>
      </div>

      {/* ── Status Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Memes",      value: s ? s.memes.total.toString() : "—",      sub: s ? `avg viral ${s.memes.avgViral.toFixed(0)}` : "" },
          { label: "Campaigns",  value: s ? s.campaigns.live.toString() : "—",   sub: s ? `${s.campaigns.total} total` : "" },
          { label: "Referrals",  value: s ? s.referrals.total.toString() : "—",  sub: s ? `${s.referrals.rewards} GST rewarded` : "" },
          { label: "Airdrops",   value: s ? s.airdrops.total.toString() : "—",   sub: s ? `${s.airdrops.gstDistributed.toLocaleString()} GST` : "" },
          { label: "Reach",      value: s ? s.campaigns.totalReach.toLocaleString() : "—", sub: "total campaign reach" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Token Metrics ────────────────────────────────────────────────── */}
      {token && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">GST Token Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Price</div>
              <div className="font-bold text-green-400">${token.price.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Market Cap</div>
              <div className="font-semibold">${(token.marketCap / 1e6).toFixed(1)}M</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>24h Volume</div>
              <div className="font-semibold">${(token.volume24h / 1e3).toFixed(0)}K</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Holders</div>
              <div className="font-semibold">{token.holders.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>24h Change</div>
              <div className={`font-bold ${token.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                {token.priceChange24h >= 0 ? "+" : ""}{token.priceChange24h.toFixed(2)}%
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Viral Campaigns ──────────────────────────────────────────────── */}
      {campaigns.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Viral Campaigns</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Title", "Platform", "Status", "Reach", "Engagement", "Viral Score"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 10).map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{c.title}</td>
                    <td className="py-2 capitalize">{c.platform}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${c.status === "live" ? "bg-green-900/60 text-green-400" : "bg-gray-800 text-gray-400"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2">{c.reach.toLocaleString()}</td>
                    <td className="py-2">{c.engagement.toLocaleString()}</td>
                    <td className="py-2 text-yellow-400 font-bold">{c.viralScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Meme Gallery ────────────────────────────────────────────────── */}
      {memes.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Recent Memes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {memes.slice(0, 8).map((m) => (
              <div key={m.id} className="rounded border p-3 space-y-1" style={{ borderColor: "var(--border)" }}>
                <div className="font-medium text-xs truncate">{m.topic}</div>
                <div className="text-xs" style={{ color: "var(--fg-muted)" }}>{m.platform}</div>
                <div className="text-yellow-400 font-bold text-xs">Viral: {m.viralScore}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Referrals ───────────────────────────────────────────────────── */}
      {referrals.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Referral Leaderboard</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Code", "Uses", "GST Rewarded", "Created"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {referrals.slice(0, 10).map((r) => (
                  <tr key={r.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-mono font-medium">{r.code}</td>
                    <td className="py-2">{r.uses}</td>
                    <td className="py-2 text-green-400">{r.totalRewards.toLocaleString()} GST</td>
                    <td className="py-2" style={{ color: "var(--fg-muted)" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!health && !summary && (
        <div className="rounded-lg border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-red-400 font-semibold">Viral Growth Engine is offline or unreachable on port 9971.</p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Start the service: cd services/ai-growth && npm start</p>
        </div>
      )}
    </div>
  );
}

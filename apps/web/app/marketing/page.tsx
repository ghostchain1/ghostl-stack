/**
 * marketing/page.tsx — AI Marketing Engine (AIMS) Dashboard
 *
 * Sections:
 *   1. Engine Status      — health, active schedule, budget summary
 *   2. Campaign Analytics — impressions, clicks, conversions, CTR
 *   3. Growth Forecast    — projected user growth (30/90/180 days)
 *   4. Social Feed        — latest tweets posted by the AI
 *   5. Top Influencers    — discovered influencer pool
 *   6. Budget Allocation  — per-channel marketing spend breakdown
 */

import type { Metadata } from "next";
import {
  fetchAimsHealth,
  fetchAimsCampaigns,
  fetchAimsForecast,
  fetchAimsTweets,
  fetchAimsInfluencers,
  fetchAimsBudget,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "AI Marketing Engine | GhostBrain",
  description: "GhostStack AIMS — autonomous content, social campaigns, influencer outreach, and SEO.",
};

export const revalidate = 30;

const STATUS_COLOR: Record<string, string> = {
  ok:      "text-green-400",
  warning: "text-yellow-400",
  error:   "text-red-400",
};

function fmtUSD(n: number) {
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function MarketingPage() {
  const [health, campaigns, forecast, tweetsData, influencersData, budget] = await Promise.all([
    fetchAimsHealth(),
    fetchAimsCampaigns(),
    fetchAimsForecast(30),
    fetchAimsTweets(),
    fetchAimsInfluencers(),
    fetchAimsBudget(),
  ]);

  const tweets      = tweetsData?.tweets      ?? [];
  const influencers = influencersData?.influencers ?? [];
  const allocations = budget?.allocations     ?? [];

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      <div>
        <h1 className="text-2xl font-bold mb-1">AI Marketing Engine</h1>
        <p style={{ color: "var(--fg-muted)" }}>Autonomous marketing brain — content, social, ads, SEO, and influencer outreach running 24/7.</p>
      </div>

      {/* ── Status Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Engine",       value: health ? health.status.toUpperCase() : "OFFLINE", color: health ? STATUS_COLOR[health.status] ?? "text-gray-400" : "text-red-400" },
          { label: "Campaigns",    value: campaigns ? String(campaigns.activeCampaigns) : "—" },
          { label: "Impressions",  value: campaigns ? campaigns.totalImpressions.toLocaleString() : "—" },
          { label: "Avg CTR",      value: campaigns ? campaigns.avgCTR.toFixed(2) + "%" : "—" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Campaign Analytics ──────────────────────────────────────────── */}
      {campaigns && (
        <section className="rounded-lg border p-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Campaign Analytics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Active Campaigns", value: campaigns.activeCampaigns },
              { label: "Total Impressions", value: campaigns.totalImpressions.toLocaleString() },
              { label: "Total Clicks",      value: campaigns.totalClicks.toLocaleString() },
              { label: "Conversions",       value: campaigns.totalConversions.toLocaleString() },
              { label: "Avg CPC",           value: "$" + campaigns.avgCPC.toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
                <div className="font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Growth Forecast ─────────────────────────────────────────────── */}
      {forecast && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">30-Day Growth Forecast</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Current Users</div>
              <div className="font-semibold">{forecast.currentUsers.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Projected Users</div>
              <div className="font-semibold text-green-400">{forecast.projectedUsers.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Growth Rate</div>
              <div className="font-semibold">{(forecast.growthRate * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Confidence</div>
              <div className="font-semibold">{(forecast.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Budget Allocation ───────────────────────────────────────────── */}
      {budget && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Marketing Budget</h2>
            <span className="text-green-400 font-bold">{fmtUSD(budget.totalUSD)}</span>
          </div>
          <div className="space-y-2">
            {allocations.map((a) => (
              <div key={a.channel} className="flex items-center gap-3">
                <div className="w-28 text-xs" style={{ color: "var(--fg-muted)" }}>{a.channel}</div>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: "var(--accent)" }} />
                </div>
                <div className="text-xs w-10 text-right">{a.pct}%</div>
                <div className="text-xs w-20 text-right text-green-400">{fmtUSD(a.amount)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Social Feed ─────────────────────────────────────────────────── */}
      {tweets.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Recent AI Tweets</h2>
          <div className="space-y-3">
            {tweets.slice(0, 5).map((t) => (
              <div key={t.id} className="rounded border p-3 space-y-1" style={{ borderColor: "var(--border)" }}>
                <p>{t.content}</p>
                <div className="flex gap-4 text-xs" style={{ color: "var(--fg-muted)" }}>
                  <span>❤️ {t.likes}</span>
                  <span>🔁 {t.retweets}</span>
                  <span>{new Date(t.postedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Influencer Pool ──────────────────────────────────────────────── */}
      {influencers.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Influencer Pool</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Handle", "Platform", "Followers", "Score"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {influencers.map((inf) => (
                  <tr key={inf.handle}>
                    <td className="py-2 font-medium">@{inf.handle}</td>
                    <td className="py-2 capitalize">{inf.platform}</td>
                    <td className="py-2">{inf.followers.toLocaleString()}</td>
                    <td className="py-2 text-yellow-400">{inf.score.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!health && !campaigns && (
        <div className="rounded-lg border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-red-400 font-semibold">AI Marketing Engine is offline or unreachable on port 9970.</p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Start the service: cd services/ai-marketing && npm start</p>
        </div>
      )}
    </div>
  );
}

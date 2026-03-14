/**
 * adoption/page.tsx — Autonomous Adoption Engine (AAE) Dashboard
 *
 * Sections:
 *   1. Engine Status      — health + headline numbers
 *   2. Developer Onboarding
 *   3. Project Pipeline
 *   4. Grant Programme
 *   5. Liquidity Expansion
 *   6. Institutional Pipeline
 */

import type { Metadata } from "next";
import {
  fetchAaeHealth,
  fetchAaeSummary,
  fetchAaeDevelopers,
  fetchAaeProjects,
  fetchAaeGrants,
  type AaeSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Adoption Engine | GhostBrain",
  description: "GhostStack AAE — developer recruitment, project onboarding, grants, liquidity, and institutional outreach.",
};

export const revalidate = 30;

interface Developer {
  username: string; chain: string; stars: number; repos: number; status: string;
}

interface Project {
  name: string; category: string; tvl: number; users: number; migrationFit: number; status: string;
}

interface Grant {
  id: string; applicant: string; amount: number; status: string; score: number; createdAt: string;
}

export default async function AdoptionPage() {
  const [health, summary, devsRaw, projectsRaw, grantsRaw] = await Promise.all([
    fetchAaeHealth(),
    fetchAaeSummary(),
    fetchAaeDevelopers(),
    fetchAaeProjects(),
    fetchAaeGrants(),
  ]);

  const s        = summary as AaeSummary | null;
  const devs     = (devsRaw     as Developer[]) ?? [];
  const projects = (projectsRaw as Project[])   ?? [];
  const grants   = (grantsRaw   as Grant[])     ?? [];

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      <div>
        <h1 className="text-2xl font-bold mb-1">Autonomous Adoption Engine</h1>
        <p style={{ color: "var(--fg-muted)" }}>Developer recruitment, project onboarding, grants, liquidity incentives, and institutional integration — all autonomous.</p>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Developers",    value: s?.developers.total?.toString()   ?? "—", sub: s ? `${s.developers.onboarded} onboarded` : "" },
          { label: "Projects",      value: s?.projects.total?.toString()     ?? "—", sub: s ? `${s.projects.onboarded} migrated` : "" },
          { label: "Grants",        value: s?.grants.total?.toString()       ?? "—", sub: s ? `${s.grants.approved} approved` : "" },
          { label: "Grant GST",     value: s ? s.grants.totalGST.toLocaleString() : "—", sub: "GST distributed" },
          { label: "Partnerships",  value: s?.partnerships.total?.toString() ?? "—", sub: s ? `${s.partnerships.active} active` : "" },
          { label: "Institutions",  value: s?.institutions.total?.toString() ?? "—", sub: s ? `${s.institutions.contacted} contacted` : "" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Developer Pipeline ───────────────────────────────────────────── */}
      {devs.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Developer Pipeline</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["GitHub Handle", "Chain", "Stars", "Repos", "Status"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devs.slice(0, 10).map((dev) => (
                  <tr key={dev.username} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">@{dev.username}</td>
                    <td className="py-2">{dev.chain}</td>
                    <td className="py-2">⭐ {dev.stars.toLocaleString()}</td>
                    <td className="py-2">{dev.repos}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${dev.status === "onboarded" ? "bg-green-900/60 text-green-400" : dev.status === "invited" ? "bg-blue-900/60 text-blue-400" : "bg-gray-800 text-gray-400"}`}>
                        {dev.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Project Pipeline ────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Project Migration Pipeline</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Project", "Category", "TVL", "Users", "Migration Fit", "Status"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 capitalize">{p.category}</td>
                    <td className="py-2">${(p.tvl / 1e6).toFixed(1)}M</td>
                    <td className="py-2">{p.users.toLocaleString()}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${p.migrationFit}%` }} />
                        </div>
                        <span>{p.migrationFit}%</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${p.status === "onboarded" ? "bg-green-900/60 text-green-400" : "bg-gray-800 text-gray-400"}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Grant Programme ─────────────────────────────────────────────── */}
      {grants.length > 0 && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Grant Programme</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--fg-muted)" }}>
                  {["Applicant", "Amount", "Score", "Status", "Date"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-medium">{g.applicant}</td>
                    <td className="py-2 text-green-400">{g.amount.toLocaleString()} GST</td>
                    <td className="py-2">{g.score}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${g.status === "approved" ? "bg-green-900/60 text-green-400" : g.status === "rejected" ? "bg-red-900/60 text-red-400" : "bg-yellow-900/60 text-yellow-400"}`}>
                        {g.status}
                      </span>
                    </td>
                    <td className="py-2" style={{ color: "var(--fg-muted)" }}>{new Date(g.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!health && !summary && (
        <div className="rounded-lg border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <p className="text-red-400 font-semibold">Adoption Engine is offline or unreachable on port 9972.</p>
          <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>Start the service: cd services/ai-adoption && npm start</p>
        </div>
      )}
    </div>
  );
}

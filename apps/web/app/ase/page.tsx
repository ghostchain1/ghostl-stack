/**
 * ase/page.tsx — Autonomous Security Engine (ASE) Dashboard
 *
 * Sections:
 *   1. Status header + KPI cards (threats, validators, blocked IPs, treasury)
 *   2. Live threat feed
 *   3. Validator protection status
 *   4. Contract audit summary
 *   5. Blocked IPs (DDoS + intrusion)
 */

import type { Metadata } from "next";
import {
  fetchAseHealth,
  fetchAseSummary,
  fetchAseThreats,
  fetchAseValidators,
  fetchAseAudits,
  fetchAseBlockedIps,
  fetchAseTreasuryStatus,
  type AseSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Security Engine | GhostBrain",
  description: "GhostStack ASE — autonomous threat detection, validator protection, treasury guard, contract auditing, DDoS defence, and intrusion detection.",
};

export const revalidate = 15;

/* ── Inline type guards ─────────────────────────────────────────────────── */
interface ThreatEvent {
  id: string; timestamp: string; category: string; severity: "info" | "medium" | "high" | "critical";
  source: string; description: string; mitigated: boolean; mitigationAction?: string;
}
interface ThreatData   { threats: ThreatEvent[] }

interface ValidatorInfo {
  id: string; address?: string; status?: string;
  missedBlocks?: number; uptime?: number; latencyMs?: number;
}
interface ValidatorResult { validators: ValidatorInfo[]; alerts: { validatorId: string; severity: string; message: string }[] }

interface AuditReport {
  name: string; score: number; blocked: boolean; timestamp: string;
  findings: { rule: string; severity: string; description: string }[];
}
interface AuditData { audits: AuditReport[]; summary: { audited: number; blocked: number; avgScore: number } }

interface BlockedIpEntry { ip: string; source: string; requestCount?: number; blockedUntil?: number }
interface BlockedData    { blocked: BlockedIpEntry[] }

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-900/80 text-red-300",
  high:     "bg-orange-900/60 text-orange-400",
  medium:   "bg-yellow-900/60 text-yellow-400",
  info:     "bg-gray-800 text-gray-400",
};

function fmt(ts: string) { return new Date(ts).toLocaleTimeString(); }

export default async function AsePage() {
  const [health, summary, threatsRaw, validatorsRaw, auditsRaw, blockedRaw, treasuryRaw] = await Promise.all([
    fetchAseHealth(),
    fetchAseSummary(),
    fetchAseThreats(),
    fetchAseValidators(),
    fetchAseAudits(),
    fetchAseBlockedIps(),
    fetchAseTreasuryStatus(),
  ]);

  const online    = health?.status === "ok";
  const s         = summary      as AseSummary      | null;
  const threats   = (threatsRaw  as ThreatData       | null)?.threats ?? [];
  const validators= validatorsRaw as ValidatorResult | null;
  const audits    = auditsRaw    as AuditData        | null;
  const blocked   = (blockedRaw  as BlockedData      | null)?.blocked ?? [];
  const treasury  = treasuryRaw  as { paused?: boolean; events?: { id: string; type: string; amount?: number; timestamp: string; alert?: boolean }[] } | null;

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">Autonomous Security Engine</h1>
          <p style={{ color: "var(--fg-muted)" }}>AI-driven cybersecurity — threat detection, validator protection, treasury guard, smart-contract auditing, DDoS defence, and intrusion detection.</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${online ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"}`}>
          {online ? "● ONLINE" : "● OFFLINE"}
        </span>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Critical Threats", value: s ? String(s.threats.critical) : "—", sub: s ? `${s.threats.unmitigated} unmitigated` : "", color: s?.threats.critical ? "text-red-400" : "" },
          { label: "Validators",       value: s?.validators ? `${s.validators.healthy}/${s.validators.total}` : "—", sub: s?.validators ? `${s.validators.alertCount} alerts` : "" },
          { label: "Blocked IPs",      value: s ? String((s.network?.blockedIps ?? 0) + (s.intrusion?.blocked ?? 0)) : "—", sub: "DDoS + intrusion" },
          { label: "Contract Audits",  value: s ? String(s.contracts.audited) : "—", sub: s ? `${s.contracts.blocked} blocked, avg ${s.contracts.avgScore?.toFixed(0) ?? "—"}/100` : "" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Live Threat Feed ─────────────────────────────────────────────── */}
      <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold text-base">Live Threat Feed</h2>
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{threats.length} events</span>
        </div>
        {threats.length === 0 ? (
          <div className="p-6 text-center text-green-400 text-xs">✓ No active threats detected</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface-elevated)", color: "var(--fg-muted)" }}>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Severity</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {threats.slice(0, 20).map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 font-mono" style={{ color: "var(--fg-muted)" }}>{fmt(t.timestamp)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${SEV_BADGE[t.severity] ?? SEV_BADGE.info}`}>{t.severity}</span>
                    </td>
                    <td className="px-4 py-2">{t.category.replace(/_/g," ")}</td>
                    <td className="px-4 py-2 font-mono">{t.source}</td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2">
                      {t.mitigated
                        ? <span className="text-green-400">✓ mitigated</span>
                        : <span className="text-orange-400">⚠ open</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Validator Protection ─────────────────────────────────────────── */}
      {validators && (
        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold text-base">Validator Protection</h2>
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>{validators.alerts.length} alerts</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x" style={{ borderColor: "var(--border)" }}>
            {validators.validators.slice(0, 8).map((v) => {
              const alert = validators.alerts.find((a) => a.validatorId === v.id);
              return (
                <div key={v.id} className="p-4 space-y-1">
                  <div className="font-mono text-xs truncate">{v.id?.slice(0, 10)}…</div>
                  <div className={`text-xs font-semibold ${alert?.severity === "critical" ? "text-red-400" : alert ? "text-yellow-400" : "text-green-400"}`}>
                    {alert ? `⚠ ${alert.severity}` : "✓ healthy"}
                  </div>
                  {v.uptime !== undefined && <div className="text-xs" style={{ color: "var(--fg-muted)" }}>uptime {v.uptime.toFixed(1)}%</div>}
                  {v.missedBlocks !== undefined && <div className="text-xs" style={{ color: "var(--fg-muted)" }}>missed {v.missedBlocks}</div>}
                </div>
              );
            })}
          </div>
          {validators.alerts.length > 0 && (
            <div className="border-t p-4 space-y-1" style={{ borderColor: "var(--border)" }}>
              {validators.alerts.slice(0, 5).map((a, i) => (
                <div key={i} className="text-xs flex gap-2">
                  <span className={a.severity === "critical" ? "text-red-400" : "text-yellow-400"}>▲</span>
                  <span className="font-mono">{a.validatorId?.slice(0, 12)}</span>
                  <span style={{ color: "var(--fg-muted)" }}>{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Contract Audit Summary ───────────────────────────────────────── */}
      {audits && (
        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold text-base">Smart Contract Audits</h2>
            <div className="text-xs space-x-3" style={{ color: "var(--fg-muted)" }}>
              <span>{audits.summary.audited} audited</span>
              <span className="text-red-400">{audits.summary.blocked} blocked</span>
              <span>avg score {audits.summary.avgScore?.toFixed(0) ?? "—"}/100</span>
            </div>
          </div>
          {audits.audits.length === 0 ? (
            <div className="p-6 text-center text-xs" style={{ color: "var(--fg-muted)" }}>No contracts audited yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface-elevated)", color: "var(--fg-muted)" }}>
                    <th className="text-left px-4 py-2 font-medium">Contract</th>
                    <th className="text-left px-4 py-2 font-medium">Score</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Findings</th>
                    <th className="text-left px-4 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.audits.slice(0, 10).map((a, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-2 font-mono">{a.name}</td>
                      <td className="px-4 py-2">
                        <span className={a.score >= 80 ? "text-green-400" : a.score >= 50 ? "text-yellow-400" : "text-red-400"}>
                          {a.score}/100
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={a.blocked ? "text-red-400 font-semibold" : "text-green-400"}>
                          {a.blocked ? "✗ BLOCKED" : "✓ PASS"}
                        </span>
                      </td>
                      <td className="px-4 py-2">{a.findings?.length ?? 0} issues</td>
                      <td className="px-4 py-2 font-mono" style={{ color: "var(--fg-muted)" }}>{fmt(a.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Treasury Guard ───────────────────────────────────────────────── */}
      {treasury && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Treasury Guard</h2>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${treasury.paused ? "bg-red-900/60 text-red-400" : "bg-green-900/60 text-green-400"}`}>
              {treasury.paused ? "⚠ PAUSED" : "✓ ACTIVE"}
            </span>
          </div>
          {(treasury.events ?? []).slice(0, 5).map((e, i) => (
            <div key={i} className={`text-xs flex gap-3 p-2 rounded ${e.alert ? "bg-red-900/20 text-red-400" : ""}`}>
              <span className="font-mono" style={{ color: "var(--fg-muted)" }}>{fmt(e.timestamp)}</span>
              <span>{e.type}</span>
              {e.amount !== undefined && <span className="ml-auto">{e.amount.toLocaleString()} GST</span>}
            </div>
          ))}
        </section>
      )}

      {/* ── Blocked IPs ──────────────────────────────────────────────────── */}
      {blocked.length > 0 && (
        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold text-base">Blocked IPs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface-elevated)", color: "var(--fg-muted)" }}>
                  <th className="text-left px-4 py-2 font-medium">IP Address</th>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium">Req Count</th>
                  <th className="text-left px-4 py-2 font-medium">Blocked Until</th>
                </tr>
              </thead>
              <tbody>
                {blocked.slice(0, 20).map((b, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 font-mono text-red-400">{b.ip}</td>
                    <td className="px-4 py-2">{b.source}</td>
                    <td className="px-4 py-2">{b.requestCount ?? "—"}</td>
                    <td className="px-4 py-2 font-mono" style={{ color: "var(--fg-muted)" }}>
                      {b.blockedUntil ? new Date(b.blockedUntil).toLocaleTimeString() : "manual"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!online && (
        <div className="rounded-lg border border-red-800 p-6 text-center text-red-400">
          ASE is currently offline or unreachable at port 9976. Start with <code className="font-mono text-red-300">make ase-dev</code>.
        </div>
      )}
    </div>
  );
}

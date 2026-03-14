"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchAdeHealth, fetchAdeSummary, fetchAdeCode, fetchAdeContracts,
  fetchAdeTests, fetchAdeAudits, fetchAdeDeployments, fetchAdePipelines,
  AdeGeneratedFile, AdeContract, AdeTestRun, AdeAuditReport, AdeDeployment, AdePipeline,
} from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function dur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
function trunc(s: string, n = 12): string { return s.length > n ? s.slice(0, n) + "…" : s; }

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{label}</span>;
}

function networkBadge(n: string) {
  const map: Record<string, string> = { GhostChain: "bg-purple-900 text-purple-200", GhostL2: "bg-blue-900 text-blue-200", GhostL3: "bg-cyan-900 text-cyan-200" };
  return <Badge label={n} color={map[n] ?? "bg-gray-700 text-gray-200"} />;
}
function auditBadge(s: string) {
  const map: Record<string, string> = { clean: "bg-green-900 text-green-200", pending: "bg-yellow-900 text-yellow-200", "issues-found": "bg-orange-900 text-orange-200", blocked: "bg-red-900 text-red-200" };
  return <Badge label={s} color={map[s] ?? "bg-gray-700 text-gray-200"} />;
}
function statusBadge(s: string) {
  const map: Record<string, string> = { passed: "bg-green-900 text-green-200", failed: "bg-red-900 text-red-200", deployed: "bg-green-900 text-green-200", clean: "bg-green-900 text-green-200", approved: "bg-green-900 text-green-200", running: "bg-blue-900 text-blue-200", rejected: "bg-red-900 text-red-200", "rolled-back": "bg-orange-900 text-orange-200" };
  return <Badge label={s} color={map[s] ?? "bg-gray-700 text-gray-200"} />;
}
function typeBadge(t: string) {
  const map: Record<string, string> = { optimization: "bg-blue-900 text-blue-200", feature: "bg-indigo-900 text-indigo-200", bugfix: "bg-red-900 text-red-200", refactor: "bg-gray-700 text-gray-300", security: "bg-orange-900 text-orange-200" };
  return <Badge label={t} color={map[t] ?? "bg-gray-700 text-gray-200"} />;
}

const LOOP_STEPS = ["idle", "generating", "testing", "auditing", "deploying", "ci"];

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">{icon} {title}</h2>
      {children}
    </section>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DevelopmentPage() {
  const [health,      setHealth]      = useState<Record<string, any> | null>(null);
  const [summary,     setSummary]     = useState<Record<string, any> | null>(null);
  const [code,        setCode]        = useState<AdeGeneratedFile[]>([]);
  const [contracts,   setContracts]   = useState<AdeContract[]>([]);
  const [tests,       setTests]       = useState<AdeTestRun[]>([]);
  const [audits,      setAudits]      = useState<AdeAuditReport[]>([]);
  const [deployments, setDeployments] = useState<AdeDeployment[]>([]);
  const [pipelines,   setPipelines]   = useState<AdePipeline[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const load = useCallback(async () => {
    const [h, s, c, ct, t, a, d, p] = await Promise.all([
      fetchAdeHealth(),
      fetchAdeSummary(),
      fetchAdeCode({ limit: 20 }),
      fetchAdeContracts({ limit: 20 }),
      fetchAdeTests({ limit: 20 }),
      fetchAdeAudits({ limit: 15 }),
      fetchAdeDeployments({ limit: 20 }),
      fetchAdePipelines({ limit: 15 }),
    ]);
    setHealth(h);
    setSummary(s);
    setCode(c ?? []);
    setContracts(ct ?? []);
    setTests(t ?? []);
    setAudits(a ?? []);
    setDeployments(d ?? []);
    setPipelines(p ?? []);
    setLoading(false);
    setLastRefresh(Date.now());
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const loop  = (health as any)?.loop ?? summary?.loop ?? {};
  const stats = summary ?? {};

  const online = health?.status === "ok";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span>⚙️</span> Ghost Autonomous Development Engine
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            AI writes, tests, audits & deploys code autonomously
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          {online
            ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse"></span>Online (port 9982)</span>
            : <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Offline</span>
          }
          <button onClick={load} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs">↻ Refresh</button>
        </div>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {/* Development Loop */}
      <Section title="Development Loop" icon="🔄">
        <div className="flex items-center gap-2 mb-4">
          {LOOP_STEPS.filter(s => s !== "idle").map((step, i) => {
            const active  = loop.step === step;
            const stepIdx = LOOP_STEPS.indexOf(loop.step ?? "idle");
            const done    = stepIdx > LOOP_STEPS.indexOf(step);
            return (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${active ? "bg-blue-600 text-white animate-pulse" : done ? "bg-green-800 text-green-200" : "bg-gray-700 text-gray-400"}`}>
                  {done ? "✓ " : active ? "⟳ " : ""}{step}
                </div>
                {i < 4 && <span className="text-gray-600">→</span>}
              </div>
            );
          })}
          <div className="ml-auto text-right text-xs text-gray-500">
            <div>Cycles: <span className="text-white font-semibold">{loop.cycles ?? 0}</span></div>
            {loop.lastCycle ? <div>Last: {ago(loop.lastCycle)}</div> : null}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Stat label="Files Generated"  value={(stats.code as any)?.total ?? 0} />
          <Stat label="Contracts Built"  value={(stats.contracts as any)?.total ?? 0} />
          <Stat label="Test Runs"        value={(stats.tests as any)?.total ?? 0} sub={`${(stats.tests as any)?.avgCoverage ?? 0}% coverage`} />
          <Stat label="Audits"           value={(stats.audits as any)?.total ?? 0} sub={`avg ${(stats.audits as any)?.avgScore ?? 0}/100`} />
          <Stat label="Deployments"      value={(stats.deployments as any)?.deployed ?? 0} sub="deployed" />
          <Stat label="CI Pipelines"     value={(stats.ci as any)?.total ?? 0} sub={`${(stats.ci as any)?.passRate ?? 0}% pass`} />
        </div>
      </Section>

      {/* Code Generation + Smart Contracts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Generated Code" icon="📝">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {code.length === 0 && <p className="text-gray-500 text-sm">No files yet</p>}
            {code.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-gray-900 rounded p-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {typeBadge(f.type)}
                  <span className="text-gray-300 truncate">{f.filename}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-green-400">+{f.linesAdded}</span>
                  <span className="text-red-400">-{f.linesRemoved}</span>
                  {statusBadge(f.status)}
                  <span className="text-gray-500">{ago(f.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Smart Contracts" icon="📜">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {contracts.length === 0 && <p className="text-gray-500 text-sm">No contracts yet</p>}
            {contracts.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-gray-900 rounded p-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-white font-semibold">{c.name}</span>
                  <Badge label={c.type} color="bg-indigo-900 text-indigo-200" />
                  {networkBadge(c.network)}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {auditBadge(c.auditStatus)}
                  {c.address && <span className="text-gray-500 font-mono">{trunc(c.address, 10)}</span>}
                  <span className="text-gray-500">{ago(c.builtAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Tests + Audits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Test Results" icon="🧪">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {tests.length === 0 && <p className="text-gray-500 text-sm">No test runs yet</p>}
            {tests.map(t => (
              <div key={t.id} className="bg-gray-900 rounded p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold">{t.target}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge label={t.type} color="bg-gray-700 text-gray-300" />
                    {statusBadge(t.status)}
                  </div>
                </div>
                <div className="flex gap-3 text-gray-400">
                  <span className="text-green-400">✓ {t.passed}</span>
                  {t.failed > 0 && <span className="text-red-400">✗ {t.failed}</span>}
                  {t.skipped > 0 && <span className="text-gray-500">— {t.skipped}</span>}
                  <span className="text-gray-500">cov {t.coverage}%</span>
                  <span className="ml-auto">{dur(t.duration)}</span>
                  <span>{ago(t.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Security Audits" icon="🔐">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {audits.length === 0 && <p className="text-gray-500 text-sm">No audits yet</p>}
            {audits.map(a => {
              const scoreColor = a.score >= 90 ? "text-green-400" : a.score >= 70 ? "text-yellow-400" : "text-red-400";
              return (
                <div key={a.id} className="bg-gray-900 rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-semibold">{a.target}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${scoreColor}`}>{a.score}/100</span>
                      {a.passed
                        ? <Badge label="approved" color="bg-green-900 text-green-200" />
                        : <Badge label="issues" color="bg-red-900 text-red-200" />
                      }
                    </div>
                  </div>
                  <div className="flex gap-3 text-gray-400">
                    {a.criticals > 0 && <span className="text-red-400">●{a.criticals} critical</span>}
                    {a.highs > 0 && <span className="text-orange-400">●{a.highs} high</span>}
                    {a.mediums > 0 && <span className="text-yellow-400">●{a.mediums} med</span>}
                    {a.lows > 0 && <span className="text-gray-500">●{a.lows} low</span>}
                    <span className="ml-auto">{ago(a.auditedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Deployments + CI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Deployments" icon="🚀">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {deployments.length === 0 && <p className="text-gray-500 text-sm">No deployments yet</p>}
            {deployments.map(d => (
              <div key={d.id} className="bg-gray-900 rounded p-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold">{d.name}</span>
                  <div className="flex items-center gap-1.5">
                    {networkBadge(d.network)}
                    {statusBadge(d.status)}
                  </div>
                </div>
                <div className="flex gap-3 text-gray-400">
                  <span>{d.version}</span>
                  {d.txHash && <span className="font-mono text-gray-500">{trunc(d.txHash, 14)}</span>}
                  {d.gasUsed && <span>{(d.gasUsed / 1000).toFixed(0)}k gas</span>}
                  {d.duration_ms && <span>{dur(d.duration_ms)}</span>}
                  <span className="ml-auto">{ago(d.deployedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="CI/CD Pipelines" icon="⚗️">
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {pipelines.length === 0 && <p className="text-gray-500 text-sm">No pipelines yet</p>}
            {pipelines.map(p => {
              const stagesTotal  = p.stages.length;
              const stagesPassed = p.stages.filter(s => s.status === "passed").length;
              const pct          = Math.round((stagesPassed / stagesTotal) * 100);
              return (
                <div key={p.id} className="bg-gray-900 rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-semibold">{p.repo}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-mono">{p.branch}@{p.commit}</span>
                      {statusBadge(p.status)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${p.status === "passed" ? "bg-green-500" : p.status === "failed" ? "bg-red-500" : "bg-blue-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-gray-400">{stagesPassed}/{stagesTotal}</span>
                    {p.duration && <span>{dur(p.duration)}</span>}
                    <span className="text-gray-500">{ago(p.triggeredAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <p className="text-xs text-gray-600 text-right">
        Last refreshed {ago(lastRefresh)} · Auto-refresh every 15s
      </p>
    </div>
  );
}

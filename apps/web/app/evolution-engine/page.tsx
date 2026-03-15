"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchEvoHealth, fetchEvoSummary, fetchEvoSnapshots, fetchEvoUpgrades,
  fetchEvoFeatures, fetchEvoChains, fetchEvoOptimizations, fetchEvoInnovations,
  EvoArchitectureSnapshot, EvoUpgradeProposal, EvoEvolvedFeature,
  EvoLaunchedChain, EvoOptimization, EvoInnovation,
} from "@/lib/api";

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{label}</span>;
}
function statusBadge(s: string) {
  const m: Record<string, string> = {
    live: "bg-green-900 text-green-200", online: "bg-green-900 text-green-200",
    approved: "bg-green-900 text-green-200", integrated: "bg-green-900 text-green-200",
    launched: "bg-green-900 text-green-200", completed: "bg-green-900 text-green-200",
    failed: "bg-red-900 text-red-200", rejected: "bg-red-900 text-red-200",
    proposed: "bg-yellow-900 text-yellow-200", prototyping: "bg-yellow-900 text-yellow-200",
    staging: "bg-blue-900 text-blue-200", evaluating: "bg-blue-900 text-blue-200",
    "in-progress": "bg-blue-900 text-blue-200", simulating: "bg-blue-900 text-blue-200",
  };
  return <Badge label={s} color={m[s] ?? "bg-gray-700 text-gray-200"} />;
}
function networkBadge(n: string) {
  const m: Record<string, string> = { GhostChain: "bg-purple-900 text-purple-200", GhostL2: "bg-blue-900 text-blue-200", GhostL3: "bg-cyan-900 text-cyan-200", all: "bg-indigo-900 text-indigo-200" };
  return <Badge label={n} color={m[n] ?? "bg-gray-700 text-gray-200"} />;
}
function healthBadge(h: string) {
  const m: Record<string, string> = { healthy: "bg-green-900 text-green-200", degraded: "bg-yellow-900 text-yellow-200", critical: "bg-red-900 text-red-200" };
  return <Badge label={h} color={m[h] ?? "bg-gray-700 text-gray-200"} />;
}
function priorityBadge(p: string) {
  const m: Record<string, string> = { critical: "bg-red-900 text-red-200", "high-value": "bg-orange-900 text-orange-200", promising: "bg-yellow-900 text-yellow-200", experimental: "bg-gray-700 text-gray-300" };
  return <Badge label={p} color={m[p] ?? "bg-gray-700 text-gray-200"} />;
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">{icon} {title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function EvolutionEnginePage() {
  const [health,    setHealth]    = useState<Record<string, any> | null>(null);
  const [summary,   setSummary]   = useState<Record<string, any> | null>(null);
  const [snapshots, setSnapshots] = useState<EvoArchitectureSnapshot[]>([]);
  const [upgrades,  setUpgrades]  = useState<EvoUpgradeProposal[]>([]);
  const [features,  setFeatures]  = useState<EvoEvolvedFeature[]>([]);
  const [chains,    setChains]    = useState<EvoLaunchedChain[]>([]);
  const [opts,      setOpts]      = useState<EvoOptimization[]>([]);
  const [innov,     setInnov]     = useState<EvoInnovation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [last,      setLast]      = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    const [h, s, sn, up, ft, ch, op, iv] = await Promise.all([
      fetchEvoHealth(), fetchEvoSummary(), fetchEvoSnapshots(5),
      fetchEvoUpgrades({ limit: 10 }), fetchEvoFeatures({ limit: 12 }),
      fetchEvoChains({ limit: 8 }), fetchEvoOptimizations({ limit: 10 }),
      fetchEvoInnovations({ limit: 10 }),
    ]);
    if (h)  setHealth(h);
    if (s)  setSummary(s);
    if (sn) setSnapshots(sn);
    if (up) setUpgrades(up);
    if (ft) setFeatures(ft);
    if (ch) setChains(ch);
    if (op) setOpts(op);
    if (iv) setInnov(iv);
    setLoading(false);
    setLast(Date.now());
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);

  const loop   = (health as any)?.loop ?? (summary as any)?.loop;
  const score  = (health as any)?.evolutionScore ?? (health as any)?.healthScore ?? 0;
  const cycle  = loop?.cycleCount ?? 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🧬 GhostStack Self-Evolution Engine</h1>
          <p className="text-sm text-gray-400 mt-1">Autonomous ecosystem redesign — architecture analysis, protocol upgrades, chain launching &amp; innovation discovery</p>
        </div>
        <div className="flex items-center gap-3">
          {health ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> online · port 9983
            </span>
          ) : (
            <span className="text-xs text-red-400">offline</span>
          )}
          <button onClick={refresh} disabled={loading} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Evolution Cycles"  value={cycle} />
        <Stat label="Health Score"      value={`${score}%`} />
        <Stat label="Chains Launched"   value={chains.length} />
        <Stat label="Innovations Found" value={innov.length} />
      </div>

      {/* Loop status */}
      <Section title="Evolution Loop" icon="⚙️">
        {loop ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${loop.running ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-sm">{loop.running ? "Running evolution cycle…" : "Idle"}</span>
              <span className="ml-auto text-xs text-gray-400">{loop.lastRun ? `Last run ${ago(loop.lastRun)}` : "Not yet run"}</span>
            </div>
            {loop.phaseLog?.length > 0 && (
              <div className="bg-gray-900 rounded p-3 text-xs font-mono text-gray-300 space-y-0.5">
                {(loop.phaseLog as string[]).map((l: string, i: number) => (
                  <div key={i} className="text-gray-400">› {l}</div>
                ))}
              </div>
            )}
            {loop.lastError && <div className="text-xs text-red-400">Error: {loop.lastError}</div>}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Service offline</p>
        )}
      </Section>

      {/* Architecture snapshots */}
      <Section title="Architecture Snapshots" icon="🏗️">
        {snapshots.length === 0 ? <p className="text-sm text-gray-500">No snapshots yet</p> : (
          <div className="space-y-3">
            {snapshots.map(sn => (
              <div key={sn.snapshotId} className="bg-gray-900 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {healthBadge(sn.networkHealth)}
                    <span className="text-sm font-medium">Score: {sn.healthScore}%</span>
                  </div>
                  <span className="text-xs text-gray-500">{ago(sn.analysedAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>{sn.bottlenecks?.length ?? 0} bottleneck(s)</div>
                  <div>{sn.improvements?.length ?? 0} improvement(s)</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Protocol upgrades */}
      <Section title="Protocol Upgrade Proposals" icon="⬆️">
        {upgrades.length === 0 ? <p className="text-sm text-gray-500">No proposals</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">Title</th>
                <th className="text-left pb-2">Type</th>
                <th className="text-left pb-2">Network</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-left pb-2">Proposed</th>
              </tr></thead>
              <tbody>
                {upgrades.map(u => (
                  <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-200 max-w-[180px] truncate">{u.title}</td>
                    <td className="py-1.5 pr-3"><Badge label={u.upgradeType} color="bg-indigo-900 text-indigo-200" /></td>
                    <td className="py-1.5 pr-3">{networkBadge(u.network)}</td>
                    <td className="py-1.5 pr-3">{statusBadge(u.status)}</td>
                    <td className="py-1.5 text-gray-500">{ago(u.proposedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Feature evolution */}
      <Section title="Feature Evolution Pipeline" icon="🌱">
        {features.length === 0 ? <p className="text-sm text-gray-500">No features</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.id} className="bg-gray-900 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{f.name}</span>
                  {statusBadge(f.status)}
                </div>
                <div className="flex gap-2 text-xs text-gray-400 mb-1">
                  <span>Complexity {f.complexity}/10</span>
                  <span>ROI {f.roi}%</span>
                  <Badge label={f.category} color="bg-gray-700 text-gray-300" />
                </div>
                <p className="text-xs text-gray-500 truncate">{f.description}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Launched chains */}
      <Section title="Launched Chains" icon="⛓️">
        {chains.length === 0 ? <p className="text-sm text-gray-500">No chains launched</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">Name</th>
                <th className="text-left pb-2">Type</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-right pb-2">TPS</th>
                <th className="text-right pb-2">Validators</th>
                <th className="text-right pb-2">Users</th>
              </tr></thead>
              <tbody>
                {chains.map(c => (
                  <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-200">{c.name}</td>
                    <td className="py-1.5 pr-3"><Badge label={c.type} color="bg-purple-900 text-purple-200" /></td>
                    <td className="py-1.5 pr-3">{statusBadge(c.status)}</td>
                    <td className="py-1.5 pr-3 text-right">{c.tps.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-right">{c.validators}</td>
                    <td className="py-1.5 text-right">{c.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Optimizations */}
      <Section title="Performance Optimizations" icon="⚡">
        {opts.length === 0 ? <p className="text-sm text-gray-500">No optimizations</p> : (
          <div className="space-y-2">
            {opts.map(o => (
              <div key={o.id} className="bg-gray-900 rounded-lg p-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white truncate">{o.service}</span>
                    {statusBadge(o.status)}
                    <Badge label={o.optimizationType} color="bg-blue-900 text-blue-200" />
                  </div>
                  <div className="text-xs text-gray-400">Rollback risk: {o.rollbackRisk}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-green-400">+{o.improvementPct.toFixed(1)}%</div>
                  <div className="text-xs text-gray-500">{ago(o.triggeredAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Innovation pipeline */}
      <Section title="Innovation Discovery Pipeline" icon="💡">
        {innov.length === 0 ? <p className="text-sm text-gray-500">No innovations discovered</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {innov.map(iv => (
              <div key={iv.id} className="bg-gray-900 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{iv.name}</span>
                  {priorityBadge(iv.priority)}
                </div>
                <div className="flex gap-2 text-xs mb-1">
                  {statusBadge(iv.status)}
                  <span className="text-gray-400">TRL {iv.trl}/9</span>
                  <span className="text-gray-400">Impact {iv.impactScore}/100</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{iv.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="text-center text-xs text-gray-600">Last refreshed {ago(last)} · Auto-refresh every 30s</p>
    </div>
  );
}

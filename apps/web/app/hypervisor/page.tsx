"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchHclHealth, fetchHclLoopStatus, fetchHclVMs, fetchHclVmStats,
  fetchHclContainers, fetchHclContainerStats, fetchHclNodes, fetchHclNodeStats,
  fetchHclMonitoring, fetchHclIncidents, fetchHclRecoveryStats,
  HclVM, HclContainer, HclNode, HclInfraSnapshot, HclIncident, HclLoopStatus,
} from "@/lib/api";

// ── Badge helpers ─────────────────────────────────────────────────────────────
function VmStateBadge({ state }: { state: string }) {
  const classes: Record<string, string> = {
    running:      "bg-green-900 text-green-300",
    stopped:      "bg-gray-700 text-gray-400",
    creating:     "bg-blue-900 text-blue-300",
    errored:      "bg-red-900 text-red-300",
    destroying:   "bg-orange-900 text-orange-300",
    snapshotting: "bg-purple-900 text-purple-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${classes[state] ?? "bg-gray-700 text-gray-300"}`}>{state}</span>;
}

function ContainerStateBadge({ state }: { state: string }) {
  const classes: Record<string, string> = {
    running:    "bg-green-900 text-green-300",
    stopped:    "bg-gray-700 text-gray-400",
    restarting: "bg-yellow-900 text-yellow-300",
    errored:    "bg-red-900 text-red-300",
    pulling:    "bg-blue-900 text-blue-300",
    exited:     "bg-orange-900 text-orange-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${classes[state] ?? "bg-gray-700 text-gray-300"}`}>{state}</span>;
}

function NodeStateBadge({ state }: { state: string }) {
  const classes: Record<string, string> = {
    running:       "bg-green-900 text-green-300",
    syncing:       "bg-blue-900 text-blue-300",
    deploying:     "bg-cyan-900 text-cyan-300",
    offline:       "bg-red-900 text-red-300",
    degraded:      "bg-yellow-900 text-yellow-300",
    decommissioned:"bg-gray-700 text-gray-400",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${classes[state] ?? "bg-gray-700 text-gray-300"}`}>{state}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes: Record<string, string> = {
    critical: "bg-red-900 text-red-300",
    high:     "bg-orange-900 text-orange-300",
    medium:   "bg-yellow-900 text-yellow-300",
    low:      "bg-blue-900 text-blue-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-mono ${classes[severity] ?? "bg-gray-700 text-gray-300"}`}>{severity}</span>;
}

function HealthBar({ pct, label }: { pct: number; label: string }) {
  const color = pct > 85 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span><span>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-700 rounded h-2">
        <div className={`${color} h-2 rounded transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HypervisorPage() {
  const [loop,      setLoop]      = useState<HclLoopStatus | null>(null);
  const [snapshot,  setSnapshot]  = useState<HclInfraSnapshot | null>(null);
  const [vms,       setVMs]       = useState<HclVM[]>([]);
  const [vmStats,   setVmStats]   = useState<Record<string, number> | null>(null);
  const [containers,setContainers]= useState<HclContainer[]>([]);
  const [ctrStats,  setCtrStats]  = useState<Record<string, unknown> | null>(null);
  const [nodes,     setNodes]     = useState<HclNode[]>([]);
  const [nodeStats, setNodeStats] = useState<Record<string, unknown> | null>(null);
  const [incidents, setIncidents] = useState<HclIncident[]>([]);
  const [recStats,  setRecStats]  = useState<Record<string, unknown> | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [l, snap, v, vs, c, cs, n, ns, inc, rs] = await Promise.all([
      fetchHclLoopStatus(),
      fetchHclMonitoring(),
      fetchHclVMs(),
      fetchHclVmStats(),
      fetchHclContainers(),
      fetchHclContainerStats(),
      fetchHclNodes(),
      fetchHclNodeStats(),
      fetchHclIncidents(),
      fetchHclRecoveryStats(),
    ]);
    setLoop(l); setSnapshot(snap);
    setVMs(v ?? []); setVmStats(vs as Record<string, number> | null);
    setContainers(c ?? []); setCtrStats(cs);
    setNodes(n ?? []); setNodeStats(ns);
    setIncidents(inc ?? []); setRecStats(rs);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const healthColor = (h?: string) =>
    h === "healthy" ? "text-green-400" : h === "degraded" ? "text-yellow-400" : "text-red-400";

  if (loading) return <div className="p-8 text-gray-400">Loading Hypervisor Control Layer…</div>;

  return (
    <div className="p-6 space-y-6 text-gray-100 min-h-screen" style={{ background: "var(--background, #0d0d0d)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🖥️ Hypervisor Control Layer</h1>
          <p className="text-gray-400 text-sm mt-1">GhostBrain autonomous infrastructure manager — VMs · Containers · Nodes · Recovery</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Cycle #{loop?.cycleCount ?? 0}</div>
          {lastRefresh && <div>Updated {lastRefresh.toLocaleTimeString()}</div>}
          <button onClick={load} className="mt-1 text-cyan-400 hover:text-cyan-300">↻ Refresh</button>
        </div>
      </div>

      {/* ── HCL Loop Status ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">HCL Control Loop</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-cyan-400">{loop?.cycleCount ?? 0}</div>
            <div className="text-xs text-gray-400">Cycles Run</div>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <div className={`text-2xl font-bold ${loop?.running ? "text-green-400" : "text-gray-400"}`}>{loop?.running ? "ACTIVE" : "IDLE"}</div>
            <div className="text-xs text-gray-400">Loop State</div>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <div className={`text-2xl font-bold ${healthColor(snapshot?.health)}`}>{snapshot?.healthScore ?? "--"}</div>
            <div className="text-xs text-gray-400">Health Score</div>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <div className={`text-2xl font-bold ${(snapshot?.alerts.length ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>{snapshot?.alerts.length ?? 0}</div>
            <div className="text-xs text-gray-400">Active Alerts</div>
          </div>
        </div>
        {snapshot && snapshot.alerts.length > 0 && (
          <div className="space-y-1">
            {snapshot.alerts.map((a, i) => (
              <div key={i} className="text-xs text-yellow-300 bg-yellow-900/20 border border-yellow-800 rounded px-3 py-1">⚠ {a}</div>
            ))}
          </div>
        )}
        {loop?.phaseLog && loop.phaseLog.length > 0 && (
          <div className="mt-3 font-mono text-xs text-gray-400 bg-gray-900 rounded p-2 max-h-24 overflow-y-auto">
            {loop.phaseLog.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </section>

      {/* ── Host Metrics ── */}
      {snapshot?.host && (
        <section className="border border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">Host Metrics — Bare Metal</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-800 rounded p-3 text-center">
              <div className="text-xl font-bold text-green-400">{snapshot.host.cpuCores}</div>
              <div className="text-xs text-gray-400">CPU Cores</div>
            </div>
            <div className="bg-gray-800 rounded p-3 text-center">
              <div className="text-xl font-bold text-blue-400">{snapshot.host.memTotalGB} GB</div>
              <div className="text-xs text-gray-400">Total RAM</div>
            </div>
            <div className="bg-gray-800 rounded p-3 text-center">
              <div className="text-xl font-bold text-purple-400">{snapshot.host.diskTotalGB} GB</div>
              <div className="text-xs text-gray-400">Total Disk</div>
            </div>
            <div className="bg-gray-800 rounded p-3 text-center">
              <div className="text-xl font-bold text-cyan-400">{snapshot.host.networkRxMbps.toFixed(0)} / {snapshot.host.networkTxMbps.toFixed(0)}</div>
              <div className="text-xs text-gray-400">RX / TX Mbps</div>
            </div>
          </div>
          <div className="space-y-2">
            <HealthBar pct={snapshot.host.cpuPct}  label="CPU Usage" />
            <HealthBar pct={snapshot.host.memPct}  label="Memory Usage" />
            <HealthBar pct={snapshot.host.diskPct} label="Disk Usage" />
          </div>
          <div className="mt-2 text-xs text-gray-500">Load avg: {snapshot.host.loadAvg.map((l) => l.toFixed(2)).join(" · ")}</div>
        </section>
      )}

      {/* ── VM Fleet ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">
          Virtual Machine Fleet ({vms.length} VMs)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(["running","stopped","errored"] as const).map((s) => (
            <div key={s} className="bg-gray-800 rounded p-3 text-center">
              <div className={`text-2xl font-bold ${s === "running" ? "text-green-400" : s === "stopped" ? "text-gray-400" : "text-red-400"}`}>
                {vms.filter((v) => v.state === s).length}
              </div>
              <div className="text-xs text-gray-400 capitalize">{s}</div>
            </div>
          ))}
          <div className="bg-gray-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-cyan-400">{(vmStats as { totalCpuCores?: number })?.totalCpuCores ?? "--"}</div>
            <div className="text-xs text-gray-400">Total vCPUs</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Name</th>
              <th className="text-left py-1 pr-3">Role</th>
              <th className="text-left py-1 pr-3">State</th>
              <th className="text-right py-1 pr-3">vCPU</th>
              <th className="text-right py-1 pr-3">RAM</th>
              <th className="text-right py-1 pr-3">CPU%</th>
              <th className="text-right py-1 pr-3">MEM%</th>
              <th className="text-left py-1">IP</th>
            </tr></thead>
            <tbody>
              {vms.map((vm) => (
                <tr key={vm.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-200">{vm.name}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{vm.role}</td>
                  <td className="py-1.5 pr-3"><VmStateBadge state={vm.state} /></td>
                  <td className="py-1.5 pr-3 text-right text-gray-300">{vm.cpuCores}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-300">{vm.ramGB}GB</td>
                  <td className={`py-1.5 pr-3 text-right ${vm.cpuPct > 80 ? "text-red-400" : "text-green-400"}`}>{vm.cpuPct.toFixed(1)}%</td>
                  <td className={`py-1.5 pr-3 text-right ${vm.memPct > 80 ? "text-yellow-400" : "text-blue-400"}`}>{vm.memPct.toFixed(1)}%</td>
                  <td className="py-1.5 font-mono text-gray-500">{vm.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Containers ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">
          Container Services ({containers.length} containers)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(["running","stopped","restarting","errored"] as const).map((s) => (
            <div key={s} className="bg-gray-800 rounded p-3 text-center">
              <div className={`text-2xl font-bold ${s === "running" ? "text-green-400" : s === "restarting" ? "text-yellow-400" : s === "errored" ? "text-red-400" : "text-gray-400"}`}>
                {containers.filter((c) => c.state === s).length}
              </div>
              <div className="text-xs text-gray-400 capitalize">{s}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Container</th>
              <th className="text-left py-1 pr-3">Stack</th>
              <th className="text-left py-1 pr-3">State</th>
              <th className="text-right py-1 pr-3">Port</th>
              <th className="text-right py-1 pr-3">CPU%</th>
              <th className="text-right py-1 pr-3">MEM MB</th>
              <th className="text-right py-1">Restarts</th>
            </tr></thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-200">{c.name}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{c.stack}</td>
                  <td className="py-1.5 pr-3"><ContainerStateBadge state={c.state} /></td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-400">{c.port ?? "—"}</td>
                  <td className={`py-1.5 pr-3 text-right ${c.cpuPct > 70 ? "text-red-400" : "text-green-400"}`}>{c.cpuPct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 text-right text-blue-400">{c.memMB.toFixed(0)}</td>
                  <td className={`py-1.5 text-right ${c.restarts > 2 ? "text-yellow-400" : "text-gray-400"}`}>{c.restarts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Blockchain Nodes ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">
          Blockchain Nodes ({nodes.length} nodes across GhostChain · L2 · L3)
        </h2>
        {(["ghostchain","ghostl2","ghostl3"] as const).map((chain) => {
          const chainNodes = nodes.filter((n) => n.chain === chain);
          if (chainNodes.length === 0) return null;
          return (
            <div key={chain} className="mb-4">
              <h3 className="text-xs font-semibold text-cyan-400 uppercase mb-2 tracking-wider">{chain}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-1 pr-3">ID</th>
                    <th className="text-left py-1 pr-3">Role</th>
                    <th className="text-left py-1 pr-3">State</th>
                    <th className="text-right py-1 pr-3">Block</th>
                    <th className="text-right py-1 pr-3">Peers</th>
                    <th className="text-right py-1 pr-3">TPS</th>
                    <th className="text-left py-1 pr-3">Synced</th>
                    <th className="text-left py-1">IP</th>
                  </tr></thead>
                  <tbody>
                    {chainNodes.map((n) => (
                      <tr key={n.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                        <td className="py-1.5 pr-3 font-mono text-gray-300">{n.id}</td>
                        <td className="py-1.5 pr-3 text-gray-400">{n.role}</td>
                        <td className="py-1.5 pr-3"><NodeStateBadge state={n.state} /></td>
                        <td className="py-1.5 pr-3 text-right font-mono text-green-300">{n.blockHeight.toLocaleString()}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-400">{n.peersConnected}</td>
                        <td className="py-1.5 pr-3 text-right text-cyan-300">{n.txPerSec.toFixed(1)}</td>
                        <td className="py-1.5 pr-3 text-center">{n.isSynced ? <span className="text-green-400">✓</span> : <span className="text-yellow-400">⟳</span>}</td>
                        <td className="py-1.5 font-mono text-gray-500">{n.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Recovery Incidents ── */}
      <section className="border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest mb-3">
          Failure Recovery Engine ({incidents.length} incidents)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {(["detected","recovering","resolved","failed"] as const).map((s) => (
            <div key={s} className="bg-gray-800 rounded p-3 text-center">
              <div className={`text-2xl font-bold ${s === "resolved" ? "text-green-400" : s === "recovering" ? "text-blue-400" : s === "failed" ? "text-red-400" : "text-yellow-400"}`}>
                {incidents.filter((i) => i.status === s).length}
              </div>
              <div className="text-xs text-gray-400 capitalize">{s}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-3">Service</th>
              <th className="text-left py-1 pr-3">Type</th>
              <th className="text-left py-1 pr-3">Severity</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-left py-1 pr-3">Action</th>
              <th className="text-left py-1">Description</th>
            </tr></thead>
            <tbody>
              {incidents.slice(0, 20).map((inc) => (
                <tr key={inc.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-1.5 pr-3 font-mono text-gray-200">{inc.service}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{inc.serviceType}</td>
                  <td className="py-1.5 pr-3"><SeverityBadge severity={inc.severity} /></td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-xs ${inc.status === "resolved" ? "text-green-400" : inc.status === "recovering" ? "text-blue-300" : inc.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>
                      {inc.status}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-gray-400 text-xs">{inc.action}</td>
                  <td className="py-1.5 text-gray-400 max-w-xs truncate">{inc.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

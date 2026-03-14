/**
 * aie/page.tsx — Autonomous Infrastructure Engine (AIE) Dashboard
 *
 * Sections:
 *   1. Status header + KPI cards (CPU, memory, containers, VMs)
 *   2. System health detail (disk, load)
 *   3. Docker container status table
 *   4. Resource balance status
 *   5. Repair log
 */

import type { Metadata } from "next";
import {
  fetchAieHealth,
  fetchAieSummary,
  fetchAieSystemHealth,
  fetchAieContainers,
  fetchAieRepairLog,
  fetchAieBalanceStatus,
  type AieSummary,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Infrastructure Engine | GhostBrain",
  description: "GhostStack AIE — autonomous infrastructure health monitoring, container supervision, VM management, and self-healing.",
};

export const revalidate = 30;

interface ContainerInfo {
  id: string; name: string; image: string; state: string;
  status: string; restarts?: number;
}
interface ContainerData {
  total: number; running: number; exited: number;
  containers: ContainerInfo[];
}
interface RepairEvent {
  timestamp: string; service: string; method: string; action: string; success: boolean;
}
interface RepairLog { events: RepairEvent[] }
interface BalanceSnapshot {
  timestamp: string; cpuPercent: number; memPercent: number;
  action: "rebalance" | "scale-out" | "hold" | "alert"; reason: string;
  recommendations: string[];
}
interface DiskEntry { mount: string; totalGB: number; usedGB: number; usedPercent: number }
interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  cpu: { usagePercent: number; cores: number };
  memory: { totalGB: number; usedGB: number; usedPercent: number };
  disk: DiskEntry[];
  load: number[];
}

const STATE_BADGE: Record<string, string> = {
  running: "bg-green-900/60 text-green-400",
  exited:  "bg-red-900/60 text-red-400",
  paused:  "bg-yellow-900/60 text-yellow-400",
};

const ACTION_COLOR: Record<string, string> = {
  hold:       "text-green-400",
  rebalance:  "text-yellow-400",
  "scale-out":"text-orange-400",
  alert:      "text-red-400",
};

function pct(n: number) { return n.toFixed(1) + "%"; }

export default async function AiePage() {
  const [health, summary, sysRaw, containersRaw, repairRaw, balanceRaw] = await Promise.all([
    fetchAieHealth(),
    fetchAieSummary(),
    fetchAieSystemHealth(),
    fetchAieContainers(),
    fetchAieRepairLog(),
    fetchAieBalanceStatus(),
  ]);

  const s          = summary      as AieSummary      | null;
  const sys        = sysRaw       as SystemHealth     | null;
  const containers = containersRaw as ContainerData   | null;
  const repairLog  = (repairRaw as { events?: RepairEvent[] } | null)?.events ?? [];
  const balance    = balanceRaw   as BalanceSnapshot  | null;

  const online = health?.status === "ok";

  return (
    <div className="p-6 space-y-8 text-sm" style={{ color: "var(--fg)" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">Autonomous Infrastructure Engine</h1>
          <p style={{ color: "var(--fg-muted)" }}>Self-healing infrastructure — system health monitoring, container supervision, VM management, and autonomous repair and scaling.</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${online ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"}`}>
          {online ? "● ONLINE" : "● OFFLINE"}
        </span>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "CPU Usage",    value: s ? pct(s.system.cpuUsagePercent)  : "—", sub: sys ? `${sys.cpu.cores} cores, load ${sys.load?.[0]?.toFixed(2) ?? "—"}` : "" },
          { label: "Memory Used",  value: s ? pct(s.system.memUsedPercent)   : "—", sub: sys ? `${sys.memory.usedGB.toFixed(1)} / ${sys.memory.totalGB.toFixed(1)} GB` : "" },
          { label: "Containers",   value: s ? `${s.containers.running}/${s.containers.total}` : "—", sub: s ? `${s.containers.restarts} restarts today` : "" },
          { label: "Balance",      value: balance?.action?.toUpperCase() ?? "—", sub: balance?.reason ?? "No data", color: balance ? ACTION_COLOR[balance.action] : "" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-lg p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>{label}</div>
            <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
            {sub && <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── System Health ────────────────────────────────────────────────── */}
      {sys && (
        <section className="rounded-lg border p-5 space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">System Health</h2>
            <span className={`px-2 py-1 rounded text-xs font-semibold ${sys.status === "healthy" ? "bg-green-900/60 text-green-400" : sys.status === "degraded" ? "bg-yellow-900/60 text-yellow-400" : "bg-red-900/60 text-red-400"}`}>
              {sys.status.toUpperCase()}
            </span>
          </div>
          {/* Disk mounts */}
          {sys.disk && sys.disk.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold" style={{ color: "var(--fg-muted)" }}>DISK USAGE</h3>
              {sys.disk.map((d) => (
                <div key={d.mount} className="flex items-center gap-3 text-xs">
                  <span className="w-20 font-mono">{d.mount}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div
                      className={`h-full rounded-full ${d.usedPercent >= 90 ? "bg-red-500" : d.usedPercent >= 75 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${d.usedPercent}%` }}
                    />
                  </div>
                  <span className="w-10 text-right">{pct(d.usedPercent)}</span>
                  <span style={{ color: "var(--fg-muted)" }}>{d.usedGB.toFixed(0)}/{d.totalGB.toFixed(0)} GB</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Container Status ─────────────────────────────────────────────── */}
      {containers && (
        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold text-base">Docker Containers</h2>
            <span style={{ color: "var(--fg-muted)" }} className="text-xs">{containers.running} running / {containers.total} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface-elevated)", color: "var(--fg-muted)" }}>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Image</th>
                  <th className="text-left px-4 py-2 font-medium">State</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {containers.containers.slice(0, 20).map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 font-mono">{c.name?.replace(/^\//, "")}</td>
                    <td className="px-4 py-2 font-mono" style={{ color: "var(--fg-muted)" }}>{c.image?.split(":")[0]}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATE_BADGE[c.state] ?? "bg-gray-800 text-gray-400"}`}>{c.state}</span>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--fg-muted)" }}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Resource Balance ─────────────────────────────────────────────── */}
      {balance && (
        <section className="rounded-lg border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Resource Balancer</h2>
            <span className={`text-sm font-bold ${ACTION_COLOR[balance.action]}`}>{balance.action.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>CPU</div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className={`h-full rounded-full ${balance.cpuPercent >= 85 ? "bg-red-500" : balance.cpuPercent >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${balance.cpuPercent}%` }} />
              </div>
              <div className="text-xs mt-1">{pct(balance.cpuPercent)}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: "var(--fg-muted)" }}>Memory</div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div className={`h-full rounded-full ${balance.memPercent >= 88 ? "bg-red-500" : balance.memPercent >= 75 ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${balance.memPercent}%` }} />
              </div>
              <div className="text-xs mt-1">{pct(balance.memPercent)}</div>
            </div>
          </div>
          {balance.recommendations?.length > 0 && (
            <ul className="text-xs space-y-1 list-disc list-inside" style={{ color: "var(--fg-muted)" }}>
              {balance.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* ── Repair Log ───────────────────────────────────────────────────── */}
      {repairLog.length > 0 && (
        <section className="rounded-lg border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-semibold text-base">Recent Auto-Repair Events</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface-elevated)", color: "var(--fg-muted)" }}>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Service</th>
                  <th className="text-left px-4 py-2 font-medium">Method</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {repairLog.slice(0, 15).map((e, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 font-mono" style={{ color: "var(--fg-muted)" }}>{new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-2 font-semibold">{e.service}</td>
                    <td className="px-4 py-2">{e.method}</td>
                    <td className="px-4 py-2">{e.action}</td>
                    <td className="px-4 py-2">
                      <span className={e.success ? "text-green-400" : "text-red-400"}>{e.success ? "✓ OK" : "✗ FAIL"}</span>
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
          AIE is currently offline or unreachable at port 9975. Start with <code className="font-mono text-red-300">make aie-dev</code>.
        </div>
      )}
    </div>
  );
}

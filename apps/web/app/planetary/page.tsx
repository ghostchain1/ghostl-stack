"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchPneHealth, fetchPneSummary, fetchPneNodes, fetchPneRegions,
  fetchPneRoutes, fetchPneLatencyMatrix, fetchPneMonitoring,
  PneGlobalNode, PneRegionConfig, PneTrafficRoute, PneLatencyEntry, PnePlanetaryHealth,
} from "@/lib/api";

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function latencyColor(ms: number): string {
  if (ms < 60)  return "text-green-400";
  if (ms < 150) return "text-yellow-400";
  if (ms < 300) return "text-orange-400";
  return "text-red-400";
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{label}</span>;
}
function statusBadge(s: string) {
  const m: Record<string, string> = {
    online: "bg-green-900 text-green-200", healthy: "bg-green-900 text-green-200",
    active: "bg-green-900 text-green-200",
    degraded: "bg-yellow-900 text-yellow-200",
    offline: "bg-red-900 text-red-200", critical: "bg-red-900 text-red-200",
    provisioning: "bg-blue-900 text-blue-200", syncing: "bg-blue-900 text-blue-200",
    failed: "bg-red-900 text-red-200",
  };
  return <Badge label={s} color={m[s] ?? "bg-gray-700 text-gray-200"} />;
}
function healthBadge(h: string) {
  const m: Record<string, string> = { healthy: "bg-green-900 text-green-200", degraded: "bg-yellow-900 text-yellow-200", critical: "bg-red-900 text-red-200" };
  return <Badge label={h} color={m[h] ?? "bg-gray-700 text-gray-200"} />;
}
function severityBadge(s: string) {
  const m: Record<string, string> = { critical: "bg-red-900 text-red-200", high: "bg-orange-900 text-orange-200", medium: "bg-yellow-900 text-yellow-200", low: "bg-gray-700 text-gray-300" };
  return <Badge label={s} color={m[s] ?? "bg-gray-700 text-gray-200"} />;
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">{icon} {title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color ?? "text-white"}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export default function PlanetaryNetworkPage() {
  const [health,  setHealth]  = useState<Record<string, any> | null>(null);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [nodes,   setNodes]   = useState<PneGlobalNode[]>([]);
  const [regions, setRegions] = useState<PneRegionConfig[]>([]);
  const [routes,  setRoutes]  = useState<PneTrafficRoute[]>([]);
  const [matrix,  setMatrix]  = useState<PneLatencyEntry[]>([]);
  const [planet,  setPlanet]  = useState<PnePlanetaryHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [last,    setLast]    = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    const [h, s, nd, rg, rt, mx, pl] = await Promise.all([
      fetchPneHealth(), fetchPneSummary(),
      fetchPneNodes({ limit: 30 }), fetchPneRegions(),
      fetchPneRoutes({ limit: 15 }), fetchPneLatencyMatrix(),
      fetchPneMonitoring(),
    ]);
    if (h)  setHealth(h);
    if (s)  setSummary(s);
    if (nd) setNodes(nd);
    if (rg) setRegions(rg);
    if (rt) setRoutes(rt);
    if (mx) setMatrix(mx);
    if (pl) setPlanet(pl);
    setLoading(false);
    setLast(Date.now());
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);

  const loop       = (health as any)?.loop ?? (summary as any)?.loop;
  const onlineCount = nodes.filter(n => n.status === "online").length;
  const avgLatency  = planet?.avgLatency_ms ?? ((health as any)?.nodes?.avgLatency ?? 0);
  const networkH    = planet?.networkHealth ?? "unknown";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🌍 Ghost Planetary Network Engine</h1>
          <p className="text-sm text-gray-400 mt-1">Autonomous global node deployment across {regions.length} regions — latency routing, infrastructure scaling &amp; planetary health monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {health ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400" /> online · port 9984
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total Nodes"   value={(health as any)?.nodes?.total ?? nodes.length} />
        <Stat label="Online"        value={onlineCount} color="text-green-400" />
        <Stat label="Regions"       value={regions.length} />
        <Stat label="Avg Latency"   value={`${avgLatency}ms`} color={latencyColor(avgLatency)} />
        <Stat label="Network"       value={networkH} color={networkH === "healthy" ? "text-green-400" : networkH === "degraded" ? "text-yellow-400" : "text-red-400"} />
      </div>

      {/* Planetary loop status */}
      <Section title="Planetary Loop" icon="🌐">
        {loop ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${loop.running ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              <span className="text-sm">{loop.running ? "Running planetary loop…" : `Idle · cycle #${loop.cycleCount}`}</span>
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
        ) : <p className="text-sm text-gray-500">Service offline</p>}
      </Section>

      {/* Active incidents */}
      {planet?.incidents && planet.incidents.length > 0 && (
        <Section title="Active Incidents" icon="🚨">
          <div className="space-y-2">
            {planet.incidents.map(inc => (
              <div key={inc.id} className="bg-gray-900 rounded-lg p-3 flex items-center gap-3">
                {severityBadge(inc.severity)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{inc.title}</div>
                  <div className="text-xs text-gray-400">{inc.region}</div>
                </div>
                {statusBadge(inc.status)}
                <span className="text-xs text-gray-500">{ago(inc.detectedAt)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Region breakdown */}
      <Section title="Regional Infrastructure" icon="🗺️">
        {regions.length === 0 ? <p className="text-sm text-gray-500">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">Region</th>
                <th className="text-right pb-2">Nodes</th>
                <th className="text-right pb-2">Online</th>
                <th className="text-right pb-2">Validators</th>
                <th className="text-right pb-2">RPC GW</th>
                <th className="text-right pb-2">Latency</th>
                <th className="text-left pb-2 pl-3">Health</th>
              </tr></thead>
              <tbody>
                {regions.sort((a, b) => b.healthScore - a.healthScore).map(r => (
                  <tr key={r.regionId} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-200">{r.region?.name ?? r.regionId}</td>
                    <td className="py-1.5 pr-3 text-right">{r.totalNodes}</td>
                    <td className="py-1.5 pr-3 text-right text-green-400">{r.onlineNodes}</td>
                    <td className="py-1.5 pr-3 text-right">{r.validators}</td>
                    <td className="py-1.5 pr-3 text-right">{r.rpcGateways}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono ${latencyColor(r.avgLatency_ms)}`}>{r.avgLatency_ms}ms</td>
                    <td className="py-1.5 pl-3">{healthBadge(r.healthScore >= 80 ? "healthy" : r.healthScore >= 50 ? "degraded" : "critical")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Node list */}
      <Section title="Global Nodes (top 30)" icon="🖥️">
        {nodes.length === 0 ? <p className="text-sm text-gray-500">No nodes</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">Node</th>
                <th className="text-left pb-2">Region</th>
                <th className="text-left pb-2">Type</th>
                <th className="text-left pb-2">Network</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-right pb-2">Latency</th>
                <th className="text-right pb-2">Peers</th>
                <th className="text-right pb-2">Uptime</th>
              </tr></thead>
              <tbody>
                {nodes.map(n => (
                  <tr key={n.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1.5 pr-3 font-mono text-gray-200">{n.name}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{n.region?.continent ?? "—"}</td>
                    <td className="py-1.5 pr-3"><Badge label={n.type} color="bg-indigo-900 text-indigo-200" /></td>
                    <td className="py-1.5 pr-3"><Badge label={n.network} color="bg-purple-900 text-purple-200" /></td>
                    <td className="py-1.5 pr-3">{statusBadge(n.status)}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono ${latencyColor(n.latency_ms)}`}>{n.status === "online" ? `${n.latency_ms}ms` : "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{n.peerCount}</td>
                    <td className="py-1.5 text-right">{n.uptime.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Traffic routes */}
      <Section title="Active Traffic Routes" icon="🔀">
        {routes.length === 0 ? <p className="text-sm text-gray-500">No routes</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">From</th>
                <th className="text-left pb-2">→ Node</th>
                <th className="text-left pb-2">Protocol</th>
                <th className="text-left pb-2">Status</th>
                <th className="text-right pb-2">Latency</th>
                <th className="text-right pb-2">Requests</th>
                <th className="text-right pb-2">Err%</th>
              </tr></thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-400">{r.userRegion?.id ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-200">{r.targetNode?.name ?? "—"}</td>
                    <td className="py-1.5 pr-3"><Badge label={r.protocol} color="bg-gray-700 text-gray-300" /></td>
                    <td className="py-1.5 pr-3">{statusBadge(r.status)}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono ${latencyColor(r.latency_ms)}`}>{r.latency_ms}ms</td>
                    <td className="py-1.5 pr-3 text-right">{r.requestsRouted.toLocaleString()}</td>
                    <td className={`py-1.5 text-right ${r.errorRate > 5 ? "text-red-400" : "text-gray-300"}`}>{r.errorRate.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Latency matrix sample */}
      <Section title="Latency Matrix (sample)" icon="📡">
        {matrix.length === 0 ? <p className="text-sm text-gray-500">No data</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left pb-2">From</th>
                <th className="text-left pb-2">To</th>
                <th className="text-right pb-2">Latency</th>
                <th className="text-right pb-2">Hops</th>
                <th className="text-left pb-2 pl-3">Protocol</th>
              </tr></thead>
              <tbody>
                {matrix.slice(0, 20).map((e, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-1 pr-3 text-gray-400">{e.fromRegion}</td>
                    <td className="py-1 pr-3 text-gray-400">{e.toRegion}</td>
                    <td className={`py-1 pr-3 text-right font-mono ${latencyColor(e.latency_ms)}`}>{e.latency_ms}ms</td>
                    <td className="py-1 pr-3 text-right">{e.hops}</td>
                    <td className="py-1 pl-3"><Badge label={e.protocol} color="bg-gray-700 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-center text-xs text-gray-600">Last refreshed {ago(last)} · Auto-refresh every 30s</p>
    </div>
  );
}

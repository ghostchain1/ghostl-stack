"use client";
import { useEffect, useState, useCallback } from "react";
import {
  fetchIneHealth,
  fetchIneLoopStatus,
  fetchIneSatellites,
  fetchIneSatelliteStats,
  fetchIneValidators,
  fetchIneValidatorStats,
  fetchIneRoutes,
  fetchIneCommLinks,
  fetchIneMonitoring,
  IneSatelliteRelay,
  IneOrbitalValidator,
  IneCommLink,
  IneRoute,
  IneSpaceSnapshot,
  IneLoopStatus,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function healthColor(h: string) {
  if (h === "healthy")  return "#22c55e";
  if (h === "degraded") return "#f59e0b";
  return "#ef4444";
}
function latencyColor(ms: number) {
  if (ms < 100)  return "#22c55e";
  if (ms < 500)  return "#f59e0b";
  if (ms < 2000) return "#f97316";
  return "#ef4444";
}
function statusBadge(s: string) {
  const colors: Record<string, string> = {
    active:       "#22c55e", healthy:  "#22c55e",
    syncing:      "#3b82f6", launching:"#3b82f6", establishing:"#3b82f6",
    degraded:     "#f59e0b", blackout: "#f97316",
    rerouted:     "#a855f7",
    offline:      "#ef4444", failed:   "#ef4444",
  };
  const c = colors[s] ?? "#6b7280";
  return (
    <span style={{ background: c, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
      {s}
    </span>
  );
}
function orbitBadge(o: string) {
  const colors: Record<string, string> = {
    LEO:            "#3b82f6",
    MEO:            "#8b5cf6",
    GEO:            "#f59e0b",
    "Lunar-Gateway":"#ec4899",
    "Deep-Space":   "#6366f1",
  };
  const c = colors[o] ?? "#6b7280";
  return (
    <span style={{ background: c, color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600 }}>
      {o}
    </span>
  );
}
function modeBadge(m: string) {
  const colors: Record<string, string> = {
    "terrestrial":     "#22c55e",
    "satellite-relay": "#3b82f6",
    "orbital-hop":     "#8b5cf6",
    "deep-space":      "#6366f1",
  };
  return (
    <span style={{ background: colors[m] ?? "#6b7280", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600 }}>
      {m}
    </span>
  );
}
function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function ago(ts: number) {
  const diffS = Math.floor((Date.now() - ts) / 1000);
  if (diffS < 60)   return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  return `${Math.floor(diffS / 3600)}h ago`;
}

// ── Card ──────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: "16px 20px", minWidth: 160 }}>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? "#e2e8f0", fontSize: 24, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InterplanetaryPage() {
  const [health,     setHealth]     = useState<Record<string, unknown> | null>(null);
  const [loop,       setLoop]       = useState<IneLoopStatus | null>(null);
  const [satellites, setSatellites] = useState<IneSatelliteRelay[]>([]);
  const [satStats,   setSatStats]   = useState<Record<string, unknown> | null>(null);
  const [validators, setValidators] = useState<IneOrbitalValidator[]>([]);
  const [valStats,   setValStats]   = useState<Record<string, unknown> | null>(null);
  const [routes,     setRoutes]     = useState<IneRoute[]>([]);
  const [commLinks,  setCommLinks]  = useState<IneCommLink[]>([]);
  const [snapshot,   setSnapshot]   = useState<IneSpaceSnapshot | null>(null);
  const [online,     setOnline]     = useState(false);

  const load = useCallback(async () => {
    const [h, l, sats, ss, vals, vs, rts, cl, mon] = await Promise.all([
      fetchIneHealth(),
      fetchIneLoopStatus(),
      fetchIneSatellites(),
      fetchIneSatelliteStats(),
      fetchIneValidators(),
      fetchIneValidatorStats(),
      fetchIneRoutes(),
      fetchIneCommLinks(),
      fetchIneMonitoring(),
    ]);
    setHealth(h);   setOnline(!!h);
    setLoop(l);
    setSatellites(sats ?? []);  setSatStats(ss);
    setValidators(vals ?? []);  setValStats(vs);
    setRoutes(rts ?? []);
    setCommLinks(cl ?? []);
    setSnapshot(mon);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const networkHealth = (snapshot?.networkHealth ?? (health as any)?.networkHealth ?? "unknown") as string;
  const healthScore   = snapshot?.healthScore ?? 0;

  return (
    <div style={{ background: "#0f0f1a", minHeight: "100vh", color: "#e2e8f0", padding: 24, fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#6366f1" }}>🛰️ Interplanetary Network Engine</h1>
        <span style={{
          background: online ? "#22c55e22" : "#ef444422",
          border: `1px solid ${online ? "#22c55e" : "#ef4444"}`,
          color: online ? "#22c55e" : "#ef4444",
          borderRadius: 6, padding: "4px 12px", fontSize: 12
        }}>
          {online ? "● ONLINE — port 9985" : "○ OFFLINE"}
        </span>
        <button onClick={load}
          style={{ marginLeft: "auto", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 12 }}>
          Refresh
        </button>
      </div>

      {/* Overview cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Network Health" value={networkHealth.toUpperCase()} color={healthColor(networkHealth)} />
        <StatCard label="Health Score" value={`${healthScore}/100`} color={healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444"} />
        <StatCard label="Satellites" value={`${snapshot?.activeSatellites ?? 0}/${snapshot?.totalSatellites ?? 0}`} sub="active / total" />
        <StatCard label="Orbital Validators" value={`${snapshot?.activeValidators ?? 0}/${snapshot?.totalValidators ?? 0}`} sub="active / total" />
        <StatCard label="Comm Links" value={`${snapshot?.activeCommLinks ?? 0}/${snapshot?.totalCommLinks ?? 0}`} sub="active / total" />
        <StatCard label="Avg Sat Latency" value={`${snapshot?.avgSatLatency_ms ?? 0}ms`} color={latencyColor(snapshot?.avgSatLatency_ms ?? 0)} />
        <StatCard label="Blocks Relayed" value={fmt(snapshot?.blocksRelayedTotal ?? 0)} />
        <StatCard label="TX Relayed" value={fmt(snapshot?.relayedTxTotal ?? 0)} />
      </div>

      {/* Loop status */}
      {loop && (
        <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>🔄 Interplanetary Loop</h2>
          <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#aaa", marginBottom: 10 }}>
            <span>Cycles: <b style={{ color: "#e2e8f0" }}>{loop.cycleCount}</b></span>
            <span>Running: <b style={{ color: loop.running ? "#22c55e" : "#888" }}>{String(loop.running)}</b></span>
            <span>Last run: <b style={{ color: "#e2e8f0" }}>{loop.lastRun ? ago(loop.lastRun) : "never"}</b></span>
            {loop.lastError && <span style={{ color: "#ef4444" }}>Error: {loop.lastError}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {loop.phaseLog.map((p, i) => (
              <div key={i} style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0", borderLeft: "2px solid #6366f1", paddingLeft: 8 }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Satellite Relays */}
      <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>🛰️ Satellite Relay Nodes ({satellites.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #2d2d4e" }}>
                {["Name","Constellation","Orbit","Network","Role","Status","Alt km","Latency","Throughput","Uptime","Blocks Relayed","Peers"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {satellites.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #1e1e3a" }}>
                  <td style={{ padding: "6px 8px", color: "#c4b5fd", fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "6px 8px" }}>{s.constellation}</td>
                  <td style={{ padding: "6px 8px" }}>{orbitBadge(s.orbit)}</td>
                  <td style={{ padding: "6px 8px", color: "#818cf8" }}>{s.network}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{s.role}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(s.status)}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{fmt(s.altitudeKm)}</td>
                  <td style={{ padding: "6px 8px", color: latencyColor(s.latency_ms) }}>{s.latency_ms}ms</td>
                  <td style={{ padding: "6px 8px" }}>{s.throughputMbps.toFixed(0)} Mbps</td>
                  <td style={{ padding: "6px 8px", color: s.uptime >= 95 ? "#22c55e" : "#f59e0b" }}>{s.uptime}%</td>
                  <td style={{ padding: "6px 8px" }}>{fmt(s.blocksRelayed)}</td>
                  <td style={{ padding: "6px 8px" }}>{s.peersConnected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {satStats && (
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "#888" }}>
            <span>Active: <b style={{ color: "#22c55e" }}>{(satStats as any).active}</b></span>
            <span>Degraded: <b style={{ color: "#f59e0b" }}>{(satStats as any).degraded}</b></span>
            <span>LEO: <b style={{ color: "#3b82f6" }}>{(satStats as any).byOrbit?.LEO ?? 0}</b></span>
            <span>MEO: <b style={{ color: "#8b5cf6" }}>{(satStats as any).byOrbit?.MEO ?? 0}</b></span>
            <span>GEO: <b style={{ color: "#f59e0b" }}>{(satStats as any).byOrbit?.GEO ?? 0}</b></span>
          </div>
        )}
      </div>

      {/* Orbital Validators */}
      <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>🌌 Orbital Validators ({validators.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #2d2d4e" }}>
                {["Name","Orbit","Network","Role","Status","Alt km","Latency","Block Height","Missed Slots","Uptime","Censorship Risk"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validators.map(v => (
                <tr key={v.id} style={{ borderBottom: "1px solid #1e1e3a" }}>
                  <td style={{ padding: "6px 8px", color: "#c4b5fd", fontWeight: 600 }}>{v.name}</td>
                  <td style={{ padding: "6px 8px" }}>{orbitBadge(v.orbitType)}</td>
                  <td style={{ padding: "6px 8px", color: "#818cf8" }}>{v.network}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{v.role}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(v.status)}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{fmt(v.altitudeKm)}</td>
                  <td style={{ padding: "6px 8px", color: latencyColor(v.latency_ms) }}>{v.latency_ms}ms</td>
                  <td style={{ padding: "6px 8px" }}>{fmt(v.blockHeight)}</td>
                  <td style={{ padding: "6px 8px", color: v.missedSlots > 10 ? "#ef4444" : "#94a3b8" }}>{v.missedSlots}</td>
                  <td style={{ padding: "6px 8px", color: v.uptime >= 95 ? "#22c55e" : "#f59e0b" }}>{v.uptime}%</td>
                  <td style={{ padding: "6px 8px", color: v.censorshipRisk === "none" ? "#22c55e" : "#f59e0b" }}>{v.censorshipRisk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {valStats && (
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "#888" }}>
            <span>Active: <b style={{ color: "#22c55e" }}>{(valStats as any).active}</b></span>
            <span>Censorship-free: <b style={{ color: "#22c55e" }}>{(valStats as any).censorshipFreePercent}%</b></span>
            <span>Avg Latency: <b style={{ color: "#e2e8f0" }}>{(valStats as any).avgLatency_ms}ms</b></span>
          </div>
        )}
      </div>

      {/* Interplanetary Routes */}
      <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>🔀 Interplanetary Routes ({routes.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #2d2d4e" }}>
                {["From","To","Mode","Protocol","Status","Latency","Requests","Bytes","Error Rate"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routes.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid #1e1e3a" }}>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{r.fromRegion}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{r.toRegion}</td>
                  <td style={{ padding: "6px 8px" }}>{modeBadge(r.mode)}</td>
                  <td style={{ padding: "6px 8px", color: "#818cf8" }}>{r.protocol}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: "6px 8px", color: latencyColor(r.latency_ms) }}>{r.latency_ms}ms</td>
                  <td style={{ padding: "6px 8px" }}>{fmt(r.requestsRouted)}</td>
                  <td style={{ padding: "6px 8px" }}>{(r.bytesRouted / 1024 / 1024).toFixed(1)} MB</td>
                  <td style={{ padding: "6px 8px", color: r.errorRate > 0.05 ? "#ef4444" : "#22c55e" }}>{pct(r.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deep-Space Comm Links */}
      <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>📡 Deep-Space Comm Links ({commLinks.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #2d2d4e" }}>
                {["Link","Protocol","Status","Distance km","Latency","Bandwidth","Signal","Packet Loss","Bytes"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commLinks.map(l => (
                <tr key={l.id} style={{ borderBottom: "1px solid #1e1e3a" }}>
                  <td style={{ padding: "6px 8px", color: "#c4b5fd", fontSize: 11 }}>{l.name}</td>
                  <td style={{ padding: "6px 8px", color: "#818cf8" }}>{l.protocol}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(l.status)}</td>
                  <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{fmt(l.distanceKm)}</td>
                  <td style={{ padding: "6px 8px", color: latencyColor(l.latency_ms) }}>{l.latency_ms}ms</td>
                  <td style={{ padding: "6px 8px" }}>{(l.bandwidth_kbps / 1000).toFixed(0)} Mbps</td>
                  <td style={{ padding: "6px 8px", color: l.signalStrength > 70 ? "#22c55e" : "#f59e0b" }}>{l.signalStrength}%</td>
                  <td style={{ padding: "6px 8px", color: l.packetLoss > 0.05 ? "#ef4444" : "#94a3b8" }}>{pct(l.packetLoss)}</td>
                  <td style={{ padding: "6px 8px" }}>{(l.bytesExchanged / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Space topology diagram */}
      <div style={{ background: "#1a1a2e", border: "1px solid #2d2d4e", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#6366f1" }}>🌍 Space Topology</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {["LEO","MEO","GEO","Lunar-Gateway","Deep-Space"].map(orbit => {
            const sats = satellites.filter(s => s.orbit === orbit);
            const vals = validators.filter(v => v.orbitType === orbit);
            if (sats.length === 0 && vals.length === 0) return null;
            return (
              <div key={orbit} style={{ background: "#0f0f1a", border: "1px solid #2d2d4e", borderRadius: 6, padding: 12, minWidth: 160 }}>
                <div style={{ color: "#6366f1", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{orbit}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  <div>🛰️ Satellites: <b style={{ color: "#e2e8f0" }}>{sats.length}</b></div>
                  <div>🌌 Validators: <b style={{ color: "#e2e8f0" }}>{vals.length}</b></div>
                  {sats.length > 0 && <div style={{ marginTop: 4, color: "#6366f1" }}>{sats.map(s => s.name).join(", ")}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ color: "#444", fontSize: 11, textAlign: "center", marginTop: 24 }}>
        Ghost Interplanetary Network Engine • port 9985 • auto-refresh 30s
      </div>
    </div>
  );
}

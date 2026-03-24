// GhostStack C3 — All Services Health Monitor
"use client";
import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ServiceHealth {
  name:    string;
  port:    number;
  group:   string;
  status:  "online" | "offline" | "degraded";
  latency: number | null;
  version?: string;
  uptime?: string;
}

export default function ServicesPage() {
  const { data, isLoading, mutate } = useSWR<ServiceHealth[]>(
    "/api/services/status",
    fetcher,
    { refreshInterval: 20_000 },
  );

  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const services = data ?? [];
  const groups   = ["all", ...Array.from(new Set(services.map(s => s.group))).sort()];
  const online   = services.filter(s => s.status === "online").length;
  const offline  = services.filter(s => s.status === "offline").length;
  const degraded = services.filter(s => s.status === "degraded").length;

  const filtered = services.filter(s => {
    if (groupFilter  !== "all" && s.group  !== groupFilter)  return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  const dotColor = (s: string) => s === "online" ? "var(--green)" : s === "degraded" ? "var(--yellow)" : "var(--red)";
  const latColor = (l: number | null) => l === null ? "var(--red)" : l < 50 ? "var(--green)" : l < 200 ? "var(--yellow)" : "var(--red)";

  return (
    <>
      <div className="page-header">
        <h1>⚙️ All Services</h1>
        <p>Live health polling across all 80+ GhostStack microservices — refreshes every 20s</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="stat-card"><div className="stat-label">Total Services</div><div className="stat-value">{services.length || "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value text-green">{online}</div></div>
        <div className="stat-card"><div className="stat-label">Degraded</div><div className="stat-value text-yellow">{degraded}</div></div>
        <div className="stat-card"><div className="stat-label">Offline</div><div className="stat-value text-red">{offline}</div></div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <div className="contract-filter-bar" style={{ margin: 0 }}>
          {(["all","online","offline","degraded"]).map(s => (
            <button key={s} className={`filter-chip ${statusFilter === s ? "active" : ""}`} onClick={() => setStatusFilter(s)}>{s}</button>
          ))}
        </div>
        <div className="contract-filter-bar" style={{ margin: 0 }}>
          {groups.slice(0, 10).map(g => (
            <button key={g} className={`filter-chip ${groupFilter === g ? "active" : ""}`} onClick={() => setGroupFilter(g)}>{g}</button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* Service list */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">Services ({filtered.length})</span>
          {isLoading && <span className="badge badge-yellow">Polling…</span>}
        </div>
        <div className="svc-grid">
          {filtered.map((s, i) => (
            <div key={i} className="svc-row">
              <div className="status-dot" style={{ background: dotColor(s.status), boxShadow: s.status === "online" ? `0 0 5px ${dotColor(s.status)}` : "none", flexShrink: 0 }} />
              <span className="svc-name">{s.name}</span>
              <span className="svc-port">:{s.port}</span>
              <span className="svc-group">{s.group}</span>
              {s.uptime && <span className="svc-uptime">{s.uptime}</span>}
              <span className="svc-latency" style={{ color: latColor(s.latency) }}>
                {s.latency !== null ? `${s.latency}ms` : "—"}
              </span>
            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
              {services.length === 0
                ? "No service data. Ensure backend services are running."
                : "No services match filters."
              }
            </div>
          )}
        </div>
      </div>
    </>
  );
}

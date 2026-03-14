"use client";
/**
 * GsccStatusPanel — live service status grid that polls /api/system/status
 * every 10 seconds and renders a colour-coded card for each microservice.
 */

import { useEffect, useState, useCallback } from "react";

interface ServiceStatus {
  id: string;
  label: string;
  group: string;
  online: boolean;
  status: string;
  latencyMs: number;
}

interface SystemStatus {
  summary: { online: number; total: number; allOnline: boolean };
  services: ServiceStatus[];
  timestamp: string;
}

const GROUP_ORDER = [
  "infrastructure",
  "security",
  "intelligence",
  "economy",
  "growth",
] as const;

const GROUP_LABELS: Record<string, string> = {
  infrastructure: "🏗 Infrastructure",
  security:       "🔐 Security",
  intelligence:   "🧠 Intelligence",
  economy:        "💰 Economy",
  growth:         "🚀 Growth Engines",
};

const groupHeaderStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginTop: "1.5rem",
  marginBottom: "0.6rem",
};

export function GsccStatusPanel() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/system/status", { cache: "no-store" });
      if (r.ok) {
        setData(await r.json() as SystemStatus);
        setLastUpdated(new Date());
      }
    } catch { /* tolerate network failures — will retry */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => { void refresh(); }, 10_000);
    return () => clearInterval(iv);
  }, [refresh]);

  if (loading) {
    return (
      <div className="card">
        <p className="text-muted">Checking service status…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <p className="text-muted">Status endpoint unavailable — retrying every 10 s</p>
      </div>
    );
  }

  const { summary, services } = data;

  const byGroup = GROUP_ORDER.reduce<Record<string, ServiceStatus[]>>((acc, g) => {
    acc[g] = services.filter((s) => s.group === g);
    return acc;
  }, {});

  return (
    <div>
      {/* Summary bar */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.7rem 1.25rem",
          marginBottom: "0.25rem",
        }}
      >
        <span>
          <span
            className={`badge ${summary.allOnline ? "badge-green" : summary.online > summary.total / 2 ? "badge-yellow" : "badge-red"}`}
          >
            <span className="dot" />
            {summary.online} / {summary.total} services online
          </span>
        </span>
        <span className="text-muted" style={{ fontSize: "0.8rem" }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Updating…"}
        </span>
      </div>

      {/* Per-group grids */}
      {GROUP_ORDER.map((group) => {
        const svcs = byGroup[group] ?? [];
        if (svcs.length === 0) return null;
        return (
          <div key={group}>
            <p style={groupHeaderStyle}>{GROUP_LABELS[group]}</p>
            <div className="grid grid-4" style={{ marginBottom: "0.5rem" }}>
              {svcs.map((svc) => (
                <div
                  key={svc.id}
                  className="card"
                  style={{ padding: "0.75rem 1rem" }}
                >
                  <div className="card-title" style={{ marginBottom: "0.4rem" }}>
                    {svc.label}
                  </div>
                  <div>
                    <span
                      className={`badge ${svc.online ? "badge-green" : "badge-red"}`}
                    >
                      <span className="dot" />
                      {svc.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="card-sub text-muted" style={{ marginTop: "0.35rem" }}>
                    {svc.online ? `${svc.latencyMs} ms` : svc.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

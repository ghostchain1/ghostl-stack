// GhostStack C3 — Security & Compliance
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface SecurityAlert {
  id:        string;
  severity:  "critical" | "warn" | "info";
  title:     string;
  desc:      string;
  source:    string;
  timestamp: number;
  resolved:  boolean;
}

interface SecuritySummary {
  alerts:        SecurityAlert[];
  threatScore:   number;
  activeThreats: number;
  blockedIPs:    number;
  auditLogSize:  number;
  slashingEvents:number;
  complianceStatus: "compliant" | "review" | "violation";
}

function severityIcon(s: string) {
  if (s === "critical") return "🚨";
  if (s === "warn")     return "⚠️";
  return "ℹ️";
}

function timeSince(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

export default function SecurityPage() {
  const { data, isLoading, mutate } = useSWR<SecuritySummary>(
    "/api/security/alerts",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const alerts   = data?.alerts ?? [];
  const critical = alerts.filter(a => a.severity === "critical" && !a.resolved);
  const warnings = alerts.filter(a => a.severity === "warn"     && !a.resolved);
  const info     = alerts.filter(a => a.severity === "info"     && !a.resolved);

  const statusColor = (s?: string) =>
    s === "compliant" ? "var(--green)" : s === "review" ? "var(--yellow)" : "var(--red)";

  return (
    <>
      <div className="page-header">
        <h1>🛡 Security &amp; Compliance</h1>
        <p>AI Security Engine alerts, compliance status, slashing events, and threat monitoring</p>
      </div>

      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1">
          {critical.length > 0 && <span className="badge badge-red">🚨 {critical.length} critical</span>}
          {warnings.length > 0 && <span className="badge badge-yellow">⚠️ {warnings.length} warnings</span>}
          {critical.length === 0 && warnings.length === 0 && <span className="badge badge-green">✅ No active threats</span>}
        </div>
        <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
      </div>

      {/* KPI row */}
      <div className="grid grid-5" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Threat Score</div>
          <div className="stat-value" style={{ color: (data?.threatScore ?? 0) > 70 ? "var(--red)" : (data?.threatScore ?? 0) > 30 ? "var(--yellow)" : "var(--green)" }}>
            {data ? data.threatScore : "—"}/100
          </div>
        </div>
        <div className="stat-card"><div className="stat-label">Active Threats</div><div className="stat-value text-red">{data?.activeThreats ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Blocked IPs</div><div className="stat-value">{data?.blockedIPs?.toLocaleString() ?? "—"}</div></div>
        <div className="stat-card"><div className="stat-label">Slashing Events</div><div className="stat-value text-yellow">{data?.slashingEvents ?? "—"}</div></div>
        <div className="stat-card">
          <div className="stat-label">Compliance</div>
          <div className="stat-value" style={{ fontSize: "1.1rem", color: statusColor(data?.complianceStatus) }}>
            {data?.complianceStatus ?? "—"}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Alert feed */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Live Alerts ({alerts.filter(a=>!a.resolved).length})</span>
            {isLoading && <span className="badge badge-yellow">Loading…</span>}
          </div>
          <div className="alert-feed">
            {alerts.filter(a => !a.resolved).slice(0, 12).map(a => (
              <div key={a.id} className={`alert-row alert-row-${a.severity}`}>
                <div className="alert-icon">{severityIcon(a.severity)}</div>
                <div className="alert-body">
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-desc">{a.desc}</div>
                  <div className="alert-meta">
                    <span>📍 {a.source}</span>
                    <span>🕐 {timeSince(a.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && alerts.filter(a=>!a.resolved).length === 0 && (
              <div style={{ color: "var(--green)", textAlign: "center", padding: "1.5rem", fontSize: "0.88rem" }}>
                ✅ No active alerts — all clear
              </div>
            )}
          </div>
        </div>

        {/* Security posture */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <div className="card-title">Security Posture</div>
            <div className="info-grid">
              <div className="info-row"><span className="info-label">AI ASE Status</span><span className="info-value text-green">Online</span></div>
              <div className="info-row"><span className="info-label">Audit Log Size</span><span className="info-value">{data?.auditLogSize ? `${(data.auditLogSize/1000).toFixed(1)}K entries` : "—"}</span></div>
              <div className="info-row"><span className="info-label">Compliance Mode</span><span className="info-value" style={{ color: statusColor(data?.complianceStatus) }}>{data?.complianceStatus ?? "—"}</span></div>
              <div className="info-row"><span className="info-label">GST Leakage Check</span><span className="info-value text-green">Pass ✓</span></div>
              <div className="info-row"><span className="info-label">Routing Guard</span><span className="info-value text-green">Active ✓</span></div>
              <div className="info-row"><span className="info-label">Bridge Escrow</span><span className="info-value text-green">Locked ✓</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Recent Resolved Alerts ({alerts.filter(a=>a.resolved).length})</div>
            {alerts.filter(a=>a.resolved).slice(0, 5).map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.78rem" }}>
                <span style={{ color: "var(--text-muted)", textDecoration: "line-through" }}>{a.title}</span>
                <span style={{ color: "var(--green)", fontSize: "0.68rem" }}>resolved</span>
              </div>
            ))}
            {alerts.filter(a=>a.resolved).length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No resolved alerts in current window.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

import {
  fetchTdsHealth,
  fetchTdsStatus,
  fetchTdsIncidents,
  type ThreatLevel,
  type TdsAlert,
  type TdsChainThreat,
  type TdsAnomaly,
  type TdsIncident,
  type TdsFirewallRule,
} from "../../lib/api";

export const dynamic = "force-dynamic";

const THREAT_COLORS: Record<ThreatLevel, string> = {
  low:      "var(--green)",
  medium:   "var(--yellow)",
  high:     "var(--accent)",
  critical: "var(--red)",
};

const THREAT_BADGES: Record<ThreatLevel, string> = {
  low:      "badge-green",
  medium:   "badge-yellow",
  high:     "badge-yellow",
  critical: "badge-red",
};

function severityBadge(sev: string) {
  const cls = sev === "critical" ? "badge-red"
            : sev === "high"     ? "badge-yellow"
            : sev === "medium"   ? "badge-yellow"
            : "badge-green";
  return <span className={`badge ${cls}`}><span className="dot" />{sev}</span>;
}

export default async function SecurityPage() {
  const [health, status, incidents] = await Promise.all([
    fetchTdsHealth(),
    fetchTdsStatus(),
    fetchTdsIncidents(),
  ]);

  const isRunning    = health?.status === "ok";
  const threatLevel  = (health?.threatLevel ?? "low") as ThreatLevel;
  const threatColor  = THREAT_COLORS[threatLevel];
  const threatBadge  = THREAT_BADGES[threatLevel];
  const fw           = status?.firewall;

  return (
    <>
      <div className="page-header">
        <h1>Threat Defense System</h1>
        <p>Real-time intrusion detection, blockchain attack monitoring &amp; automated incident response (port 9960)</p>
      </div>

      {/* ── Status row ─────────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">TDS Status</div>
          <div style={{ marginTop: "0.4rem" }}>
            {isRunning
              ? <span className="badge badge-green"><span className="dot" />Running</span>
              : <span className="badge badge-red"><span className="dot" />Offline</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Threat Level</div>
          <div style={{ marginTop: "0.4rem" }}>
            <span className={`badge ${threatBadge}`} style={{ color: threatColor }}>
              <span className="dot" />{threatLevel.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Defense Cycles</div>
          <div className="card-value">{health?.cycleCount?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="card">
          <div className="card-title">Blocked IPs</div>
          <div className="card-value" style={{ color: fw?.totalBlocked ? "var(--red)" : undefined }}>
            {fw?.totalBlocked ?? "—"}
          </div>
        </div>
      </div>

      {/* ── Firewall stats ─────────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">RPC Firewall Activity</div>
          <table className="service-table">
            <tbody>
              <tr><td>Total Requests Seen</td>
                <td>{fw?.totalRequests?.toLocaleString() ?? "—"}</td>
              </tr>
              <tr><td>Auto-Blocked IPs</td>
                <td style={{ color: fw?.autoBlocked ? "var(--red)" : undefined }}>
                  {fw?.autoBlocked ?? "—"}
                </td>
              </tr>
              <tr><td>Manually Blocked</td><td>{fw?.manualBlocked ?? "—"}</td></tr>
              <tr><td>iptables Enabled</td>
                <td>{status?.firewall
                  ? (status.firewall as unknown as { iptablesEnabled?: boolean }).iptablesEnabled ? "Yes" : "No"
                  : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Active Alerts</div>
          <table className="service-table">
            <tbody>
              <tr><td>Intrusion Alerts</td>
                <td style={{ color: (status?.alerts?.length ?? 0) > 0 ? "var(--red)" : undefined }}>
                  {status?.alerts?.length ?? 0}
                </td>
              </tr>
              <tr><td>Chain Threats</td>
                <td style={{ color: (status?.chainThreats?.length ?? 0) > 0 ? "var(--red)" : undefined }}>
                  {status?.chainThreats?.length ?? 0}
                </td>
              </tr>
              <tr><td>Anomalies</td>
                <td style={{ color: (status?.anomalies?.length ?? 0) > 0 ? "var(--yellow)" : undefined }}>
                  {status?.anomalies?.length ?? 0}
                </td>
              </tr>
              <tr><td>Total Incidents</td><td>{status?.incidents?.length ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Intrusion alerts ───────────────────────────────────────────── */}
      {(status?.alerts?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title" style={{ color: "var(--red)" }}>Intrusion Alerts</div>
          <table className="service-table">
            <thead>
              <tr><th>Type</th><th>Severity</th><th>Source IP</th><th>Message</th><th>Count</th><th>Time</th></tr>
            </thead>
            <tbody>
              {status!.alerts.map((a: TdsAlert, i: number) => (
                <tr key={i}>
                  <td><code>{a.type}</code></td>
                  <td>{severityBadge(a.severity)}</td>
                  <td><code>{a.sourceIp ?? "—"}</code></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{a.message}</td>
                  <td>{a.count}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {new Date(a.ts).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Blockchain threats ─────────────────────────────────────────── */}
      {(status?.chainThreats?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title" style={{ color: "var(--red)" }}>Blockchain Threats</div>
          <table className="service-table">
            <thead>
              <tr><th>Type</th><th>Chain</th><th>Severity</th><th>Detail</th><th>Time</th></tr>
            </thead>
            <tbody>
              {status!.chainThreats.map((t: TdsChainThreat, i: number) => (
                <tr key={i}>
                  <td><code>{t.type}</code></td>
                  <td>{t.chain}</td>
                  <td>{severityBadge(t.severity)}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{t.detail}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {new Date(t.ts).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Anomalies ──────────────────────────────────────────────────── */}
      {(status?.anomalies?.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="card-title">AI Anomalies Detected</div>
          <table className="service-table">
            <thead>
              <tr><th>Metric</th><th>Source</th><th>Value</th><th>Baseline</th><th>Z-Score</th><th>Severity</th></tr>
            </thead>
            <tbody>
              {status!.anomalies.map((a: TdsAnomaly, i: number) => (
                <tr key={i}>
                  <td><code>{a.metric}</code></td>
                  <td>{a.source}</td>
                  <td>{a.value.toFixed(2)}</td>
                  <td>{a.baseline.toFixed(2)}</td>
                  <td style={{ color: Math.abs(a.zScore) >= 4.5 ? "var(--red)" : "var(--yellow)" }}>
                    {a.zScore.toFixed(2)}
                  </td>
                  <td>{severityBadge(a.severity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Blocked IPs ────────────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-title">Blocked IPs</div>
          {(status?.blockedIps?.length ?? 0) > 0 ? (
            <table className="service-table">
              <thead><tr><th>IP</th><th>Action</th><th>Reason</th><th>Blocked At</th></tr></thead>
              <tbody>
                {status!.blockedIps.slice(0, 20).map((r: TdsFirewallRule, i: number) => (
                  <tr key={i}>
                    <td><code>{r.ip}</code></td>
                    <td><span className="badge badge-red"><span className="dot" />{r.action}</span></td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{r.reason}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No IPs currently blocked</p>
          )}
        </div>

        {/* ── Recent incidents ─────────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">Recent Incidents</div>
          {(incidents?.length ?? 0) > 0 ? (
            <table className="service-table">
              <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Actions</th><th>Time</th></tr></thead>
              <tbody>
                {(incidents ?? []).slice(0, 15).map((inc: TdsIncident) => (
                  <tr key={inc.id}>
                    <td><code style={{ fontSize: "0.7rem" }}>{inc.id}</code></td>
                    <td><code style={{ fontSize: "0.75rem" }}>{inc.threat.type}</code></td>
                    <td>
                      <span className={`badge ${inc.status === "ok" ? "badge-green" : inc.status === "failed" ? "badge-red" : "badge-yellow"}`}>
                        <span className="dot" />{inc.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {inc.actions.length > 0 ? inc.actions[0]!.slice(0, 40) : "—"}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                      {new Date(inc.ts).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem" }}>No incidents recorded</p>
          )}
        </div>
      </div>

      {/* ── REST API reference ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">TDS REST API (port 9960)</div>
        <table className="service-table">
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["GET",  "/health",           "Status, threat level, cycle count"],
              ["GET",  "/status",           "Full status — alerts, threats, anomalies, incidents, firewall"],
              ["GET",  "/alerts",           "Current intrusion + chain + anomaly alerts"],
              ["GET",  "/incidents",        "Incident response history (last 100)"],
              ["GET",  "/blocked-ips",      "IP blocklist with reasons"],
              ["GET",  "/firewall",         "RPC firewall statistics"],
              ["GET",  "/intel/rules",      "Security intelligence rule set"],
              ["POST", "/intel/rules",      "Add new threat rule (ThreatRule body)"],
              ["POST", "/response/trigger", "Manually trigger incident response"],
            ].map(([m, e, d]) => (
              <tr key={e}>
                <td><code style={{ color: m === "GET" ? "var(--green)" : "var(--accent)" }}>{m}</code></td>
                <td><code style={{ fontSize: "0.75rem" }}>{e}</code></td>
                <td style={{ color: "var(--text-muted)" }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

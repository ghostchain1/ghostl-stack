"use client";
import useSWR from "swr";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SummaryData {
  overallRisk:   "low" | "medium" | "high" | "critical" | "unknown";
  healthTier:    "healthy" | "degraded" | "critical";
  systemScore:   number;
  anomalyActive: boolean;
  openIncidents: number;
  onlineNodes:   number;
  totalNodes:    number;
  avgCpu:        number;
  avgMemory:     number;
  cycleCount:    number;
  lastRun:       number | null;
}

interface Prediction {
  nodeId:      string;
  label:       string;
  risk:        "low" | "medium" | "high" | "critical";
  prediction:  string;
  confidence:  number;
  triggeredBy: string[];
}

interface AnomalyItem {
  id:          string;
  nodeId:      string;
  type:        string;
  description: string;
  severity:    "low" | "medium" | "high" | "critical";
  timestamp:   number;
}

interface Incident {
  id:          string;
  type:        string;
  description: string;
  status:      "open" | "responding" | "resolved" | "escalated";
  response:    string;
  timestamp:   number;
}

interface ScalingEvent {
  id:        string;
  action:    string;
  reason:    string;
  nodeType:  string;
  triggered: boolean;
  timestamp: number;
}

interface AiOpsData {
  summary:     SummaryData | null;
  predictions: { overallRisk: string; predictions: Prediction[]; highRiskCount: number } | null;
  anomalies:   { current: { anomaly: boolean; anomalies: AnomalyItem[] }; history: AnomalyItem[] } | null;
  incidents:   { log: Incident[]; open: Incident[]; total: number } | null;
  scaling:     { history: ScalingEvent[]; latest: ScalingEvent | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const RISK_BADGE: Record<string, string> = {
  low:      "badge-green",
  medium:   "badge-yellow",
  high:     "badge-red",
  critical: "badge-red",
  unknown:  "badge-gray",
};

const SEVERITY_BADGE: Record<string, string> = {
  low:      "badge-green",
  medium:   "badge-yellow",
  high:     "badge-red",
  critical: "badge-red",
};

const INCIDENT_BADGE: Record<string, string> = {
  open:       "badge-yellow",
  responding: "badge-cyan",
  resolved:   "badge-green",
  escalated:  "badge-red",
};

const TIER_COLOR: Record<string, string> = {
  healthy:  "#10b981",
  degraded: "#f59e0b",
  critical: "#ef4444",
};

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AiOpsPage() {
  const { data, isLoading, mutate } = useSWR<AiOpsData>(
    "/api/aiops/status",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const summary     = data?.summary     ?? null;
  const predictions = data?.predictions ?? null;
  const anomalies   = data?.anomalies   ?? null;
  const incidents   = data?.incidents   ?? null;
  const scaling     = data?.scaling     ?? null;
  const aiopsOnline = !isLoading && !!summary;

  const nonLowPredictions = predictions?.predictions?.filter(p => p.risk !== "low") ?? [];
  const activeAnomalies   = anomalies?.current?.anomalies ?? [];
  const recentIncidents   = incidents?.log?.slice(-10).reverse() ?? [];
  const recentScaling     = scaling?.history?.slice(-8).reverse() ?? [];

  return (
    <>
      <div className="page-header">
        <h1>🔮 AI Operations Center</h1>
        <p>Predictive failure detection · Anomaly monitoring · Autonomous incident response · Auto-scaling</p>
      </div>

      {/* Status bar */}
      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
          <span className={`badge ${aiopsOnline ? "badge-green" : "badge-red"}`}>
            <span className="dot" />{aiopsOnline ? "AIOps online" : "AIOps offline (port 9988)"}
          </span>
          {summary && (
            <>
              <span className={`badge ${RISK_BADGE[summary.overallRisk]}`}>
                Risk: {summary.overallRisk}
              </span>
              <span className={`badge ${summary.anomalyActive ? "badge-red" : "badge-green"}`}>
                {summary.anomalyActive ? "⚠ Anomaly active" : "✓ No anomalies"}
              </span>
              {summary.openIncidents > 0 && (
                <span className="badge badge-red">{summary.openIncidents} open incidents</span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
        </div>
      </div>

      {/* Offline notice */}
      {!isLoading && !aiopsOnline && (
        <div className="card" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          AIOps service is offline. Start with <span className="mono">make aiops-dev</span> (port 9988).
          It will auto-collect metrics and begin predicting failures within 2 seconds.
        </div>
      )}

      {/* ── System health KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">System Score</div>
          <div className="stat-value" style={{
            color: summary
              ? (summary.systemScore > 70 ? "#ef4444" : summary.systemScore > 40 ? "#f59e0b" : "#10b981")
              : "var(--text-muted)",
          }}>
            {summary?.systemScore ?? "—"}
          </div>
          <div style={{ fontSize: "0.75rem", color: summary ? TIER_COLOR[summary.healthTier] : "var(--text-muted)" }}>
            {summary?.healthTier ?? "unknown"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg CPU</div>
          <div className="stat-value">{summary ? `${summary.avgCpu}%` : "—"}</div>
          {summary && (
            <div className="progress-bar mt-1">
              <div className="progress-fill" style={{
                width: `${summary.avgCpu}%`,
                background: summary.avgCpu > 80 ? "#ef4444" : "#7c3aed",
              }} />
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-label">Online Nodes</div>
          <div className="stat-value">{summary ? `${summary.onlineNodes} / ${summary.totalNodes}` : "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {summary ? `${summary.totalNodes - summary.onlineNodes} offline` : ""}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Loop Cycles</div>
          <div className="stat-value">{summary?.cycleCount ?? "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {summary?.lastRun ? timeSince(summary.lastRun) : "pending"}
          </div>
        </div>
      </div>

      {/* ── Predictions + Anomalies ────────────────────────────────────────── */}
      <div className="grid grid-2" style={{ marginBottom: "1.5rem" }}>

        {/* Failure Predictions */}
        <div className="card">
          <div className="card-title">
            🔭 Failure Predictions
            {predictions && (
              <span style={{ float: "right", fontWeight: 400, fontSize: "0.75rem" }}>
                {predictions.highRiskCount} high-risk node{predictions.highRiskCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {nonLowPredictions.length === 0 && !isLoading && (
            <div style={{ color: "#10b981", fontSize: "0.85rem" }}>✓ All nodes within normal parameters</div>
          )}

          {nonLowPredictions.map(pred => (
            <div
              key={pred.nodeId}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{pred.label}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{pred.prediction}</div>
                {pred.triggeredBy.length > 0 && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    {pred.triggeredBy.slice(0, 3).join(" · ")}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "0.5rem" }}>
                <span className={`badge ${RISK_BADGE[pred.risk]}`}>{pred.risk}</span>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  {pred.confidence}% conf
                </div>
              </div>
            </div>
          ))}

          {isLoading && <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</div>}
        </div>

        {/* Active Anomalies */}
        <div className="card">
          <div className="card-title">⚡ Active Anomalies</div>

          {anomalies?.current?.anomaly === false && (
            <div style={{ color: "#10b981", fontSize: "0.85rem" }}>✓ No anomalies detected this cycle</div>
          )}

          {activeAnomalies.map(a => (
            <div key={a.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {a.type.replace(/_/g, " ")}
                </div>
                <span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity}</span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.15rem" }}>
                {a.description}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                node: {a.nodeId} · {timeSince(a.timestamp)}
              </div>
            </div>
          ))}

          {isLoading && <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</div>}
        </div>
      </div>

      {/* ── Incident Log ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">
          🚨 Incident Log
          <span style={{ float: "right", fontWeight: 400, fontSize: "0.75rem" }}>
            Total: {incidents?.total ?? 0} · Open: {incidents?.open?.length ?? 0}
          </span>
        </div>

        {recentIncidents.length === 0 && !isLoading && (
          <div style={{ color: "var(--text-muted)" }}>No incidents recorded yet.</div>
        )}

        {recentIncidents.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Response</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentIncidents.map(inc => (
                <tr key={inc.id}>
                  <td className="mono" style={{ fontSize: "0.75rem" }}>{inc.id}</td>
                  <td style={{ fontSize: "0.8rem" }}>{inc.type.replace(/_/g, " ")}</td>
                  <td><span className={`badge ${INCIDENT_BADGE[inc.status]}`}>{inc.status}</span></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem", maxWidth: "280px" }}>
                    {inc.response}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {timeSince(inc.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Scaling Events ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">⚖ Auto-Scaling Events</div>

        {recentScaling.length === 0 && !isLoading && (
          <div style={{ color: "var(--text-muted)" }}>No scaling events yet.</div>
        )}

        {recentScaling.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Action</th>
                <th>Type</th>
                <th>Triggered</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentScaling.map(ev => (
                <tr key={ev.id}>
                  <td className="mono" style={{ fontSize: "0.75rem" }}>{ev.id}</td>
                  <td style={{ fontSize: "0.8rem" }}>{ev.action.replace(/_/g, " ")}</td>
                  <td style={{ color: "var(--text-muted)" }}>{ev.nodeType}</td>
                  <td>
                    <span className={`badge ${ev.triggered ? "badge-green" : "badge-gray"}`}>
                      {ev.triggered ? "yes" : "no"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem", maxWidth: "260px" }}>
                    {ev.reason}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                    {timeSince(ev.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

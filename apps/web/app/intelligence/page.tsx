/**
 * /intelligence — GhostBrain Global Intelligence Network Dashboard
 *
 * Displays real-time status of the GIN: registered nodes, knowledge exchange,
 * distributed decisions, AI swarm tasks, telemetry, and cross-chain metrics.
 */

import {
  fetchGinHealth,
  fetchGinNodes,
  fetchGinKnowledge,
  fetchGinDecisions,
  fetchGinSwarmTasks,
  fetchGinChainMetrics,
  type GinNode,
  type GinKnowledgeItem,
  type GinDecision,
  type GinSwarmTask,
  type GinChainMetric,
  type GinHealth,
} from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  switch (status) {
    case "online":      case "operational": case "completed": case "approved": case "executed":
      return "badge-green";
    case "offline":     case "failed":      case "rejected":
      return "badge-red";
    case "degraded":    case "congested":   case "warning":
      return "badge-yellow";
    default:
      return "badge-gray";
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case "emergency": return "badge-red";
    case "high":      return "badge-yellow";
    case "normal":    return "badge-green";
    default:          return "badge-gray";
  }
}

function relativeTime(ts: number): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000)  return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function votePercent(decision: GinDecision, choice: "yes" | "no" | "abstain"): string {
  const total = decision.votes.length;
  if (total === 0) return "0%";
  const count = decision.votes.filter(v => v.choice === choice).length;
  return `${Math.round((count / total) * 100)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IntelligencePage() {
  const [health, nodes, knowledge, decisions, tasks, chains] = await Promise.all([
    fetchGinHealth(),
    fetchGinNodes(),
    fetchGinKnowledge(25),
    fetchGinDecisions(),
    fetchGinSwarmTasks(25),
    fetchGinChainMetrics(),
  ]);

  const isOnline  = health?.status === "ok";
  const nodeList  = nodes ?? [];
  const knList    = knowledge ?? [];
  const decList   = decisions ?? [];
  const taskList  = tasks ?? [];
  const chainList = chains ?? [];

  return (
    <main className="page">
      <h1>Global Intelligence Network</h1>
      <p className="subtitle">Planet-scale AI coordination across all GhostStack nodes</p>

      {/* ── Status Row ──────────────────────────────────────────────────────── */}
      <section className="status-row">
        <div className={`status-card ${isOnline ? "online" : "offline"}`}>
          <span className="label">GIN Status</span>
          <span className="value">{isOnline ? "Online" : "Offline"}</span>
        </div>
        <div className="status-card">
          <span className="label">Nodes Online</span>
          <span className="value">{health?.nodes.online ?? "–"} / {health?.nodes.total ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">Intelligence Cycles</span>
          <span className="value">{health?.cycleCount ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">WebSocket Peers</span>
          <span className="value">{health?.wsClients ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">Knowledge Items</span>
          <span className="value">{health?.knowledge.totalItems ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">Active Decisions</span>
          <span className="value">{health?.decisions.active ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">Pending Tasks</span>
          <span className="value">{health?.swarm.pending ?? "–"}</span>
        </div>
        <div className="status-card">
          <span className="label">Host CPU Load (1m)</span>
          <span className="value">{health?.telemetry.currentLoad1.toFixed(2) ?? "–"}</span>
        </div>
      </section>

      {/* ── Node Registry + Cross-Chain Status ──────────────────────────────── */}
      <div className="two-col">
        <section className="card">
          <h2>Node Registry</h2>
          {nodeList.length === 0 ? (
            <p className="empty">No nodes registered.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Node ID</th><th>Region</th><th>Role</th><th>Status</th><th>Last Seen</th></tr>
              </thead>
              <tbody>
                {nodeList.map((n: GinNode) => (
                  <tr key={n.id}>
                    <td><code>{n.id}</code></td>
                    <td>{n.region}</td>
                    <td>{n.role}</td>
                    <td><span className={`badge ${statusBadge(n.status)}`}>{n.status}</span></td>
                    <td>{relativeTime(n.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2>Cross-Chain Intelligence</h2>
          {chainList.length === 0 ? (
            <p className="empty">No chain metrics collected yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Chain</th><th>Status</th><th>Block Height</th><th>Latency</th></tr>
              </thead>
              <tbody>
                {chainList.map((m: GinChainMetric) => (
                  <tr key={m.chain}>
                    <td><strong>{m.chain}</strong></td>
                    <td><span className={`badge ${statusBadge(m.status)}`}>{m.status}</span></td>
                    <td>{m.blockHeight?.toLocaleString() ?? "—"}</td>
                    <td>{m.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Knowledge Exchange ──────────────────────────────────────────────── */}
      <section className="card">
        <h2>Knowledge Exchange</h2>
        <p className="subtitle-sm">
          Intelligence items shared across the network —{" "}
          {health?.knowledge.totalItems ?? 0} total (ring capacity {health?.knowledge.ringCapacity ?? 500})
        </p>
        {knList.length === 0 ? (
          <p className="empty">No knowledge items yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Source</th><th>Origin</th><th>Region</th><th>Severity</th><th>Age</th></tr>
            </thead>
            <tbody>
              {knList.map((k: GinKnowledgeItem) => (
                <tr key={k.id}>
                  <td><code>{k.source}</code></td>
                  <td>{k.origin}</td>
                  <td>{k.region}</td>
                  <td><span className={`badge ${statusBadge(k.severity)}`}>{k.severity}</span></td>
                  <td>{relativeTime(k.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Distributed Decisions ───────────────────────────────────────────── */}
      <section className="card">
        <h2>Distributed Decisions</h2>
        <p className="subtitle-sm">
          Executed: {health?.decisions.executed ?? 0} &nbsp;|&nbsp;
          Rejected: {health?.decisions.rejected ?? 0} &nbsp;|&nbsp;
          Active:   {health?.decisions.active ?? 0}
        </p>
        {decList.length === 0 ? (
          <p className="empty">No decisions recorded.</p>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Type</th><th>Title</th><th>Status</th><th>Quorum</th><th>YES</th><th>NO</th><th>Deadline</th></tr>
            </thead>
            <tbody>
              {decList.slice(0, 20).map((d: GinDecision) => (
                <tr key={d.id}>
                  <td><code>{d.id.slice(-10)}</code></td>
                  <td>{d.type}</td>
                  <td>{d.title}</td>
                  <td><span className={`badge ${statusBadge(d.status)}`}>{d.status}</span></td>
                  <td>{Math.round(d.quorum * 100)}%</td>
                  <td>{votePercent(d, "yes")}</td>
                  <td>{votePercent(d, "no")}</td>
                  <td className={Date.now() > d.deadline && d.status === "voting" ? "text-red" : ""}>
                    {relativeTime(d.deadline)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── AI Swarm Tasks ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2>AI Swarm Activity</h2>
        <p className="subtitle-sm">
          Pending: {health?.swarm.pending ?? 0} &nbsp;|&nbsp;
          In Progress: {(health?.swarm.assigned ?? 0) + (health?.swarm.inProgress ?? 0)} &nbsp;|&nbsp;
          Completed: {health?.swarm.completed ?? 0} &nbsp;|&nbsp;
          Failed: {health?.swarm.failed ?? 0}
        </p>
        {taskList.length === 0 ? (
          <p className="empty">No swarm tasks recorded.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Task ID</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned Node</th><th>Created</th></tr>
            </thead>
            <tbody>
              {taskList.map((t: GinSwarmTask) => (
                <tr key={t.id}>
                  <td><code>{t.id.slice(-12)}</code></td>
                  <td>{t.type}</td>
                  <td><span className={`badge ${priorityBadge(t.priority)}`}>{t.priority}</span></td>
                  <td><span className={`badge ${statusBadge(t.status)}`}>{t.status}</span></td>
                  <td>{t.assignedNode ?? "—"}</td>
                  <td>{relativeTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Telemetry Mesh ──────────────────────────────────────────────────── */}
      <section className="card">
        <h2>Telemetry Mesh</h2>
        <div className="two-col metrics-row">
          <div>
            <strong>CPU Load (1m / 5m / 15m)</strong>
            <p>{health ? `${health.telemetry.currentLoad1.toFixed(2)} / — / —` : "—"}</p>
          </div>
          <div>
            <strong>Memory Used</strong>
            <p>{health ? `${health.telemetry.currentMemUsedPct}%` : "—"}</p>
          </div>
          <div>
            <strong>Telemetry History</strong>
            <p>{health?.telemetry.historyDepth ?? 0} samples</p>
          </div>
          <div>
            <strong>Last Pushed to GDM</strong>
            <p>{health?.telemetry.lastPushedAt ? relativeTime(health.telemetry.lastPushedAt) : "never"}</p>
          </div>
        </div>
      </section>

      {/* ── API Reference ───────────────────────────────────────────────────── */}
      <section className="card">
        <h2>GIN REST API (port 9980)</h2>
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
          <tbody>
            {[
              ["GET",    "/health",             "Liveness probe + global summary"],
              ["GET",    "/status",             "Full GIN state snapshot"],
              ["GET",    "/nodes",              "List all registered nodes"],
              ["POST",   "/nodes/register",     "Register a GIN node"],
              ["POST",   "/nodes/:id/heartbeat","Node heartbeat ping"],
              ["DELETE", "/nodes/:id",          "Deregister a node"],
              ["GET",    "/knowledge",          "Browse knowledge items"],
              ["POST",   "/knowledge",          "Share a knowledge item"],
              ["GET",    "/decisions",          "List decisions"],
              ["POST",   "/decisions",          "Create a decision"],
              ["POST",   "/decisions/:id/vote", "Cast a vote"],
              ["GET",    "/decisions/:id/tally","Vote tally"],
              ["GET",    "/swarm/tasks",        "List swarm tasks"],
              ["POST",   "/swarm/tasks",        "Create a swarm task"],
              ["PATCH",  "/swarm/tasks/:id",    "Update task status"],
              ["GET",    "/telemetry",          "Local telemetry history"],
              ["GET",    "/telemetry/chains",   "Cross-chain metrics"],
              ["WS",     "/ws",                 "Real-time intelligence event stream"],
            ].map(([m, p, d]) => (
              <tr key={p}>
                <td><code>{m}</code></td>
                <td><code>{p}</code></td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

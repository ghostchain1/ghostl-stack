/**
 * /kernel — GhostBrain Sovereign Core Kernel (SCK) Dashboard
 *
 * Displays real-time state of the SCK: kernel health, AI task scheduler,
 * resource allocation, service supervisor, security agents, and the
 * Intelligence Bus. Also provides a full REST API reference.
 */

import {
  fetchKernelHealth,
  fetchKernelTelemetry,
  fetchKernelTasks,
  fetchKernelResources,
  fetchKernelServices,
  fetchKernelAgents,
  fetchKernelAudit,
  fetchKernelBusStatus,
  fetchKernelBusEvents,
  type KernelTask,
  type KernelResourceSnapshot,
  type KernelServiceEntry,
  type KernelSecurityAgent,
  type KernelAuditEntry,
  type KernelBusEvent,
  type KernelSchedulerStats,
  type KernelSupervisorSummary,
  type KernelBusStatus,
  type ResourceLevel,
  type KernelServiceStatus,
} from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────

function levelBadge(level: ResourceLevel | KernelServiceStatus | string): string {
  switch (level) {
    case "ok": case "healthy": return "badge-green";
    case "warning": case "degraded": return "badge-yellow";
    case "critical": case "down": return "badge-red";
    default: return "badge-gray";
  }
}

function priorityBadge(p: string): string {
  switch (p) {
    case "emergency": return "badge-red";
    case "critical":  return "badge-red";
    case "high":      return "badge-yellow";
    case "normal":    return "badge-blue";
    case "low":       return "badge-gray";
    default:          return "badge-gray";
  }
}

function statusBadge(s: string): string {
  switch (s) {
    case "completed": return "badge-green";
    case "running":   return "badge-blue";
    case "queued":    return "badge-yellow";
    case "failed":    return "badge-red";
    case "cancelled": case "expired": return "badge-gray";
    default:          return "badge-gray";
  }
}

function roleBadge(role: string): string {
  switch (role) {
    case "sovereign": return "badge-red";
    case "admin":     return "badge-yellow";
    case "operator":  return "badge-blue";
    default:          return "badge-gray";
  }
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────

function HealthCard({ health, telemetry }: { health: Record<string, unknown> | null; telemetry: Record<string, unknown> | null }) {
  if (!health) return <div className="card"><h2>Kernel Health</h2><p className="muted">Offline</p></div>;
  return (
    <div className="card">
      <h2>Kernel Health</h2>
      <div className="stat-row">
        <span className="stat-label">Status</span>
        <span className={`badge ${levelBadge("healthy")}`}>{String(health["status"] ?? "ok")}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Uptime</span>
        <span>{typeof health["uptimeSeconds"] === "number" ? `${Math.floor(health["uptimeSeconds"] / 60)} min` : "—"}</span>
      </div>
      {telemetry && (
        <>
          <div className="stat-row">
            <span className="stat-label">CPU Load</span>
            <span>{typeof telemetry["cpuLoad"] === "number" ? pct(telemetry["cpuLoad"] as number) : "—"}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Memory Used</span>
            <span>{typeof telemetry["memUsedMb"] === "number" ? `${Math.round(telemetry["memUsedMb"] as number)} MB` : "—"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function SchedulerCard({ tasks, stats }: { tasks: KernelTask[]; stats: KernelSchedulerStats | null }) {
  const recent = tasks.slice(0, 20);
  return (
    <div className="card">
      <h2>AI Task Scheduler</h2>
      {stats && (
        <div className="stat-grid">
          <div className="stat-box"><div className="stat-num">{stats.queued}</div><div className="stat-lbl">Queued</div></div>
          <div className="stat-box"><div className="stat-num">{stats.running}</div><div className="stat-lbl">Running</div></div>
          <div className="stat-box"><div className="stat-num">{stats.completed}</div><div className="stat-lbl">Done</div></div>
          <div className="stat-box"><div className="stat-num">{stats.failed}</div><div className="stat-lbl">Failed</div></div>
          <div className="stat-box"><div className="stat-num">{stats.expired}</div><div className="stat-lbl">Expired</div></div>
          <div className="stat-box"><div className="stat-num">{stats.totalSubmitted}</div><div className="stat-lbl">Total</div></div>
        </div>
      )}
      {recent.length > 0 ? (
        <table className="data-table">
          <thead><tr><th>Priority</th><th>Category</th><th>Title</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            {recent.map(t => (
              <tr key={t.id}>
                <td><span className={`badge ${priorityBadge(t.priority)}`}>{t.priority}</span></td>
                <td><code>{t.category}</code></td>
                <td>{t.title}</td>
                <td><span className={`badge ${statusBadge(t.status)}`}>{t.status}</span></td>
                <td>{fmtTime(t.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No tasks in queue.</p>
      )}
    </div>
  );
}

function ResourceCard({ snap }: { snap: KernelResourceSnapshot | null }) {
  if (!snap) return <div className="card"><h2>Resource Allocation</h2><p className="muted">No data</p></div>;
  return (
    <div className="card">
      <h2>Resource Allocation</h2>
      <div className="stat-row">
        <span className="stat-label">Overall</span>
        <span className={`badge ${levelBadge(snap.overallLevel)}`}>{snap.overallLevel}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">CPU Usage</span>
        <span className={`badge ${levelBadge(snap.cpu.level)}`}>{pct(snap.cpu.usagePercent)}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">Memory</span>
        <span className={`badge ${levelBadge(snap.memory.level)}`}>
          {Math.round(snap.memory.usedMb)} / {Math.round(snap.memory.totalMb)} MB ({pct(snap.memory.usagePercent)})
        </span>
      </div>
      {snap.disk.map((d, i) => (
        <div key={i} className="stat-row">
          <span className="stat-label">Disk {d.path}</span>
          <span className={`badge ${levelBadge(d.level)}`}>{pct(d.usagePercent)}</span>
        </div>
      ))}
      {snap.alerts.length > 0 && (
        <div className="alert-list">
          {snap.alerts.map((a, i) => <div key={i} className="alert-item">{a}</div>)}
        </div>
      )}
    </div>
  );
}

function SupervisorCard({ services, summary }: { services: KernelServiceEntry[]; summary: KernelSupervisorSummary | null }) {
  return (
    <div className="card">
      <h2>Service Supervisor</h2>
      {summary && (
        <div className="stat-grid">
          <div className="stat-box"><div className="stat-num">{summary.healthy}</div><div className="stat-lbl">Healthy</div></div>
          <div className="stat-box"><div className="stat-num">{summary.degraded}</div><div className="stat-lbl">Degraded</div></div>
          <div className="stat-box"><div className="stat-num">{summary.down}</div><div className="stat-lbl">Down</div></div>
          <div className="stat-box"><div className="stat-num">{summary.total_restarts}</div><div className="stat-lbl">Restarts</div></div>
        </div>
      )}
      {services.length > 0 ? (
        <table className="data-table">
          <thead><tr><th>Service</th><th>Status</th><th>Critical</th><th>Restarts</th><th>Last Checked</th></tr></thead>
          <tbody>
            {services.map(s => (
              <tr key={s.name}>
                <td><code>{s.name}</code></td>
                <td><span className={`badge ${levelBadge(s.status)}`}>{s.status}</span></td>
                <td>{s.critical ? <span className="badge badge-yellow">yes</span> : "—"}</td>
                <td>{s.restartCount}</td>
                <td>{fmtTime(s.lastChecked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No service data available.</p>
      )}
    </div>
  );
}

function SecurityCard({ agents, audit }: { agents: KernelSecurityAgent[]; audit: KernelAuditEntry[] }) {
  return (
    <div className="card">
      <h2>Security Core — Agents</h2>
      {agents.length > 0 ? (
        <table className="data-table">
          <thead><tr><th>Agent</th><th>Role</th><th>Active</th><th>Capabilities</th><th>Last Seen</th></tr></thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.id}>
                <td><code>{a.id}</code></td>
                <td><span className={`badge ${roleBadge(a.role)}`}>{a.role}</span></td>
                <td>{a.active ? <span className="badge badge-green">yes</span> : <span className="badge badge-gray">no</span>}</td>
                <td><small>{a.capabilities.join(", ") || "—"}</small></td>
                <td>{fmtTime(a.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No agents registered.</p>
      )}

      <h3 style={{ marginTop: "1.5rem" }}>Recent Audit Log</h3>
      {audit.length > 0 ? (
        <table className="data-table">
          <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Result</th></tr></thead>
          <tbody>
            {audit.slice(0, 15).map(e => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td><code>{e.agentId}</code></td>
                <td><code>{e.action}</code></td>
                <td><span className={`badge ${e.allowed ? "badge-green" : "badge-red"}`}>{e.allowed ? "allowed" : "denied"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No audit entries yet.</p>
      )}
    </div>
  );
}

function BusCard({ status, events }: { status: KernelBusStatus | null; events: KernelBusEvent[] }) {
  return (
    <div className="card">
      <h2>Intelligence Bus</h2>
      {status && (
        <div className="stat-grid">
          <div className="stat-box"><div className="stat-num">{status.publishCount}</div><div className="stat-lbl">Published</div></div>
          <div className="stat-box"><div className="stat-num">{status.subscriberCount}</div><div className="stat-lbl">Local Subs</div></div>
          <div className="stat-box"><div className="stat-num">{status.remoteSubscriberCount}</div><div className="stat-lbl">Remote Subs</div></div>
          <div className="stat-box"><div className="stat-num">{status.deadLetterCount}</div><div className="stat-lbl">Dead Letters</div></div>
        </div>
      )}
      {events.length > 0 ? (
        <table className="data-table">
          <thead><tr><th>Time</th><th>Topic</th><th>Source</th></tr></thead>
          <tbody>
            {events.slice(0, 20).map(e => (
              <tr key={e.id}>
                <td>{fmtTime(e.timestamp)}</td>
                <td><code>{e.topic}</code></td>
                <td><code>{e.source}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No recent events.</p>
      )}
    </div>
  );
}

function ApiReference() {
  const endpoints: { method: string; path: string; desc: string }[] = [
    { method: "GET",    path: "/health",                  desc: "Kernel health check" },
    { method: "GET",    path: "/telemetry",               desc: "Latest system telemetry snapshot" },
    { method: "GET",    path: "/policy",                  desc: "Current kernel policy" },
    { method: "POST",   path: "/kernel/action",           desc: "Dispatch a kernel action" },
    { method: "POST",   path: "/kernel/policy",           desc: "Update kernel policy" },
    { method: "GET",    path: "/vms",                     desc: "List VMs" },
    { method: "GET",    path: "/containers",              desc: "List containers" },
    { method: "GET",    path: "/network",                 desc: "List iptables rules" },
    { method: "GET",    path: "/storage",                 desc: "Disk usage" },
    { method: "GET",    path: "/security",                desc: "Auth log failure map" },
    { method: "GET",    path: "/scheduler/tasks",         desc: "List scheduler tasks + stats" },
    { method: "POST",   path: "/scheduler/task",          desc: "Submit a new task" },
    { method: "DELETE", path: "/scheduler/task/:id",      desc: "Cancel a task" },
    { method: "GET",    path: "/resources",               desc: "Latest resource snapshot" },
    { method: "POST",   path: "/resources/admit",         desc: "Check if action is admitted by resources" },
    { method: "GET",    path: "/supervisor/services",     desc: "All service statuses + summary" },
    { method: "POST",   path: "/supervisor/sweep",        desc: "Trigger manual supervisor sweep" },
    { method: "GET",    path: "/sck/agents",              desc: "List all registered security agents" },
    { method: "POST",   path: "/sck/agents",              desc: "Register a new agent" },
    { method: "POST",   path: "/sck/agents/:id/token",   desc: "Issue a signed token for an agent" },
    { method: "POST",   path: "/sck/verify",             desc: "Verify a token" },
    { method: "POST",   path: "/sck/authorize",          desc: "Check if agent can perform action" },
    { method: "GET",    path: "/sck/audit",              desc: "Recent audit log entries" },
    { method: "GET",    path: "/bus/status",             desc: "Intelligence Bus status" },
    { method: "GET",    path: "/bus/events",             desc: "Recent bus events (filter by topic)" },
    { method: "POST",   path: "/bus/publish",            desc: "Manually publish a bus event" },
    { method: "POST",   path: "/bus/subscribe",          desc: "Register a remote subscriber" },
    { method: "DELETE", path: "/bus/subscribe/:id",      desc: "Remove a remote subscriber" },
    { method: "GET",    path: "/bus/subscribers",        desc: "List all remote subscribers" },
  ];
  const methodColor = (m: string) => m === "GET" ? "badge-blue" : m === "POST" ? "badge-green" : "badge-red";
  return (
    <div className="card">
      <h2>REST API Reference — port 9300</h2>
      <table className="data-table">
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>
          {endpoints.map(e => (
            <tr key={e.path + e.method}>
              <td><span className={`badge ${methodColor(e.method)}`}>{e.method}</span></td>
              <td><code>{e.path}</code></td>
              <td>{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default async function KernelPage() {
  const [health, telemetry, taskData, resources, serviceData, agentData, auditData, busStatus, busEvents] =
    await Promise.all([
      fetchKernelHealth(),
      fetchKernelTelemetry(),
      fetchKernelTasks(),
      fetchKernelResources(),
      fetchKernelServices(),
      fetchKernelAgents(),
      fetchKernelAudit(50),
      fetchKernelBusStatus(),
      fetchKernelBusEvents(undefined, 50),
    ]);

  const tasks   = taskData?.tasks   ?? [];
  const stats   = taskData?.stats   ?? null;
  const services     = serviceData?.services  ?? [];
  const supervisor   = serviceData?.summary   ?? null;
  const agents       = agentData?.agents      ?? [];
  const audit        = auditData?.entries     ?? [];
  const events       = busEvents?.events      ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Sovereign Core Kernel</h1>
        <p className="subtitle">GhostBrain AI OS — port 9300 — 5s event loop</p>
      </div>

      <div className="grid-2">
        <HealthCard health={health} telemetry={telemetry} />
        <ResourceCard snap={resources} />
      </div>

      <SchedulerCard tasks={tasks} stats={stats} />

      <SupervisorCard services={services} summary={supervisor} />

      <SecurityCard agents={agents} audit={audit} />

      <BusCard status={busStatus} events={events} />

      <ApiReference />
    </div>
  );
}

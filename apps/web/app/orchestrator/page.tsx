/**
 * orchestrator/page.tsx — GhostBrain Universal Orchestrator Dashboard
 *
 * Sections:
 *  1. System Health Map   — all 26 subsystems, ok/fail badges + latency
 *  2. Orchestrator Status — loop cycle, critical event count, task/workflow stats
 *  3. Critical Events     — unacknowledged critical / emergency events
 *  4. Active Workflows    — running playbooks with step breakdown
 *  5. Command Console     — recent operator / AI commands + stats
 *  6. Decision Router     — full routing table (type → primary service)
 *  7. Task Scheduler      — all scheduled tasks, next run, last status
 *  8. Event Stream        — recent events with category / severity filter
 *  9. Workflow History    — recent completed / failed playbooks
 * 10. API Reference       — endpoint catalogue
 */

import type { Metadata } from "next";

import {
  fetchUoStatus,
  fetchUoSystems,
  fetchUoCommands,
  fetchUoRoutingTable,
  fetchUoWorkflows,
  fetchUoTasks,
  fetchUoEvents,
  type UoServiceHealth,
  type UoCommand,
  type UoWorkflowRun,
  type UoWorkflowStep,
  type UoTask,
  type UoEvent,
  type UoStatus,
} from "@/lib/api";

export const metadata: Metadata = {
  title: "Universal Orchestrator | GhostBrain",
  description: "GhostStack UO — top-level command and control for all 26 GhostBrain subsystems.",
};

export const revalidate = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts(epoch: number): string {
  return new Date(epoch).toLocaleString();
}

function ms(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

function badge(ok: boolean): string {
  return ok ? "✅" : "❌";
}

function severityClass(sev: string): string {
  switch (sev) {
    case "emergency": return "status-danger";
    case "critical":  return "status-warning";
    case "warning":   return "status-info";
    default:          return "";
  }
}

function workflowStatusClass(status: string): string {
  switch (status) {
    case "completed": return "status-good";
    case "failed":
    case "aborted":   return "status-bad";
    case "running":   return "status-info";
    default:          return "";
  }
}

function stepStatusIcon(status: string): string {
  switch (status) {
    case "completed": return "✅";
    case "failed":    return "❌";
    case "skipped":   return "⏭";
    case "running":   return "⏳";
    default:          return "⬜";
  }
}

function commandStatusClass(status: string): string {
  switch (status) {
    case "completed": return "status-good";
    case "failed":
    case "rejected":  return "status-bad";
    case "dispatching": return "status-info";
    default:          return "";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OrchestratorPage() {
  const [status, systems, commandData, routingTable, workflowData, taskData, eventData] = await Promise.all([
    fetchUoStatus(),
    fetchUoSystems(),
    fetchUoCommands(30),
    fetchUoRoutingTable(),
    fetchUoWorkflows(15),
    fetchUoTasks(),
    fetchUoEvents({ limit: 50 }),
  ]);

  const healthMap  = systems?.systems ?? {};
  const healthy    = systems?.healthy ?? 0;
  const total      = systems?.total ?? 0;
  const healthPct  = total > 0 ? Math.round((healthy / total) * 100) : 0;

  const commands   = commandData?.history ?? [];
  const cmdStats   = commandData?.stats;
  const routes     = (routingTable?.routes as unknown[]) ?? [];
  const activeWf   = workflowData?.active ?? [];
  const wfHistory  = workflowData?.history ?? [];
  const wfStats    = workflowData?.stats;
  const available  = workflowData?.available ?? [];
  const tasks      = taskData?.tasks ?? [];
  const taskStats  = taskData?.stats;
  const events     = eventData?.events ?? [];
  const eventStats = eventData?.stats;
  const critical   = eventData?.critical ?? [];

  const s: UoStatus | null = status;

  return (
    <div className="page-content">
      <h1>🎛️ Universal Orchestrator</h1>
      <p className="subtitle">Central command and coordination for all 26 GhostBrain subsystems — the apex of the GhostStack AI architecture.</p>

      {/* ── 1. System Health Map ──────────────────────────────────────── */}
      <section className="card">
        <h2>System Health Map</h2>
        <p className="section-meta">
          <strong className={healthy === total ? "status-good" : "status-bad"}>{healthy}/{total}</strong> subsystems healthy
          {" · "}<strong>{healthPct}%</strong> availability
        </p>
        {total === 0 ? (
          <p className="muted">Orchestrator is offline or health data unavailable.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Service</th><th>Status</th><th>Latency</th><th>Last Check</th></tr>
            </thead>
            <tbody>
              {Object.entries(healthMap).sort(([a],[b]) => a.localeCompare(b)).map(([name, h]) => {
                const hh = h as UoServiceHealth;
                return (
                  <tr key={name}>
                    <td><code>{name}</code></td>
                    <td className={hh.ok ? "status-good" : "status-bad"}>{badge(hh.ok)} {hh.ok ? "Online" : "Offline"}</td>
                    <td>{ms(hh.latencyMs)}</td>
                    <td>{ts(hh.lastChecked)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 2. Orchestrator Status ────────────────────────────────────── */}
      <section className="card">
        <h2>Orchestrator Status</h2>
        <div className="stats-grid">
          <div className="stat-tile">
            <div className="stat-label">Commands Total</div>
            <div className="stat-value">{s?.commands.total ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Cmd Success Rate</div>
            <div className={`stat-value ${(s?.commands.successRate ?? 0) > 0.9 ? "status-good" : "status-warning"}`}>
              {s ? `${(s.commands.successRate * 100).toFixed(1)} %` : "—"}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Active Workflows</div>
            <div className="stat-value">{s?.workflows.active ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Total Workflows</div>
            <div className="stat-value">{s?.workflows.total ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Scheduled Tasks</div>
            <div className="stat-value">{s?.tasks.total ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Events Ingested</div>
            <div className="stat-value">{s?.events.total ?? "—"}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Critical Events</div>
            <div className={`stat-value ${(s?.critical ?? 0) > 0 ? "status-bad" : ""}`}>
              {s?.critical ?? "—"}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Routes Processed</div>
            <div className="stat-value">{s?.routes.total ?? "—"}</div>
          </div>
        </div>
      </section>

      {/* ── 3. Critical Events ────────────────────────────────────────── */}
      <section className="card">
        <h2>🚨 Critical Event Queue</h2>
        {critical.length === 0 ? (
          <p className="status-good">No unacknowledged critical or emergency events.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Severity</th><th>Category</th><th>Message</th><th>Source</th><th>Workflow Hint</th><th>Time</th></tr>
            </thead>
            <tbody>
              {critical.map((evt: UoEvent) => (
                <tr key={evt.id} className={severityClass(evt.severity)}>
                  <td><strong>{evt.severity.toUpperCase()}</strong></td>
                  <td>{evt.category}</td>
                  <td>{evt.message}</td>
                  <td>{evt.source}</td>
                  <td>{evt.workflowHint ? <code>{evt.workflowHint}</code> : "—"}</td>
                  <td>{ts(evt.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 4. Active Workflows ───────────────────────────────────────── */}
      <section className="card">
        <h2>⚙️ Active Workflows</h2>
        <p className="section-meta">Available playbooks: {available.map((p: string) => <code key={p} style={{marginRight: "0.4rem"}}>{p}</code>)}</p>
        {activeWf.length === 0 ? (
          <p className="muted">No workflows currently running.</p>
        ) : (
          activeWf.map((wf: UoWorkflowRun) => (
            <div key={wf.id} className="card" style={{marginBottom: "1rem"}}>
              <h3><code>{wf.playbook}</code> <span className={workflowStatusClass(wf.status)}>[{wf.status}]</span></h3>
              <p className="muted">Triggered by <strong>{wf.triggeredBy}</strong> · started {ts(wf.startedAt)}</p>
              <table className="data-table">
                <thead>
                  <tr><th>Step</th><th>Service</th><th>Status</th><th>Duration</th></tr>
                </thead>
                <tbody>
                  {wf.steps.map((step: UoWorkflowStep, i: number) => (
                    <tr key={i} className={workflowStatusClass(step.status)}>
                      <td>{stepStatusIcon(step.status)} {step.name}</td>
                      <td>{step.service}</td>
                      <td>{step.status}</td>
                      <td>{step.startedAt && step.completedAt ? ms(step.completedAt - step.startedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      {/* ── 5. Command Console ────────────────────────────────────────── */}
      <section className="card">
        <h2>📡 Command Console</h2>
        {cmdStats && (
          <div className="stats-grid" style={{marginBottom: "1rem"}}>
            <div className="stat-tile"><div className="stat-label">Total</div><div className="stat-value">{cmdStats.total}</div></div>
            <div className="stat-tile"><div className="stat-label">Completed</div><div className="stat-value status-good">{cmdStats.completed}</div></div>
            <div className="stat-tile"><div className="stat-label">Failed</div><div className="stat-value status-bad">{cmdStats.failed}</div></div>
            <div className="stat-tile"><div className="stat-label">Rejected</div><div className="stat-value status-warning">{cmdStats.rejected}</div></div>
            <div className="stat-tile">
              <div className="stat-label">Success Rate</div>
              <div className={`stat-value ${cmdStats.successRate > 0.9 ? "status-good" : "status-warning"}`}>
                {(cmdStats.successRate * 100).toFixed(1)} %
              </div>
            </div>
          </div>
        )}
        {commands.length === 0 ? (
          <p className="muted">No commands issued yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Target</th><th>Action</th><th>Priority</th><th>Source</th><th>Status</th><th>Requester</th><th>Issued</th></tr>
            </thead>
            <tbody>
              {commands.map((cmd: UoCommand) => (
                <tr key={cmd.id} className={commandStatusClass(cmd.status)}>
                  <td><code>{cmd.target}</code></td>
                  <td><code>{cmd.action}</code></td>
                  <td>{cmd.priority}</td>
                  <td>{cmd.source}</td>
                  <td>{cmd.status}</td>
                  <td>{cmd.requester}</td>
                  <td>{ts(cmd.issuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 6. Decision Routing Table ─────────────────────────────────── */}
      <section className="card">
        <h2>🗺️ Decision Routing Table</h2>
        {routes.length === 0 ? (
          <p className="muted">Routing table unavailable.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Decision Type</th><th>Primary Service</th><th>Endpoint</th><th>Method</th><th>Secondary Co-handlers</th></tr>
            </thead>
            <tbody>
              {(routes as Array<{
                type: string;
                primary: { service: string; endpoint: string; method: string };
                secondary: Array<{ service: string }>;
              }>).map((entry) => (
                <tr key={entry.type}>
                  <td><code>{entry.type}</code></td>
                  <td>{entry.primary?.service ?? "—"}</td>
                  <td><code>{entry.primary?.endpoint ?? "—"}</code></td>
                  <td>{entry.primary?.method ?? "—"}</td>
                  <td>{entry.secondary?.map((s) => s.service).join(", ") || "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 7. Task Scheduler ─────────────────────────────────────────── */}
      <section className="card">
        <h2>⏱️ Task Scheduler</h2>
        {taskStats && (
          <div className="stats-grid" style={{marginBottom: "1rem"}}>
            <div className="stat-tile"><div className="stat-label">Total Tasks</div><div className="stat-value">{taskStats.total}</div></div>
            <div className="stat-tile"><div className="stat-label">Enabled</div><div className="stat-value">{taskStats.enabled}</div></div>
            <div className="stat-tile"><div className="stat-label">Recurring</div><div className="stat-value">{taskStats.recurring}</div></div>
            <div className="stat-tile"><div className="stat-label">OK Runs</div><div className="stat-value status-good">{taskStats.okRuns}</div></div>
            <div className="stat-tile"><div className="stat-label">Error Runs</div><div className="stat-value status-bad">{taskStats.errorRuns}</div></div>
          </div>
        )}
        {tasks.length === 0 ? (
          <p className="muted">No tasks scheduled.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Label</th><th>Type</th><th>Interval</th><th>Enabled</th><th>Last Status</th><th>Next Run</th><th>Added By</th></tr>
            </thead>
            <tbody>
              {tasks.map((t: UoTask) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td><code>{t.type}</code></td>
                  <td>{t.intervalMs ? ms(t.intervalMs) : "one-shot"}</td>
                  <td>{t.enabled ? "✅" : "❌"}</td>
                  <td className={t.lastStatus === "ok" ? "status-good" : t.lastStatus === "error" ? "status-bad" : ""}>
                    {t.lastStatus ?? "—"}
                  </td>
                  <td>{ts(t.nextRunAt)}</td>
                  <td>{t.addedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 8. Event Stream ───────────────────────────────────────────── */}
      <section className="card">
        <h2>📨 Event Stream</h2>
        {eventStats && (
          <div className="stats-grid" style={{marginBottom: "1rem"}}>
            <div className="stat-tile"><div className="stat-label">Total Events</div><div className="stat-value">{eventStats.total}</div></div>
            <div className="stat-tile"><div className="stat-label">Critical</div><div className={`stat-value ${eventStats.critical > 0 ? "status-warning" : ""}`}>{eventStats.critical}</div></div>
            <div className="stat-tile"><div className="stat-label">Emergency</div><div className={`stat-value ${eventStats.emergency > 0 ? "status-bad" : ""}`}>{eventStats.emergency}</div></div>
            {Object.entries(eventStats.bySeverity ?? {}).map(([sev, count]) => (
              <div key={sev} className="stat-tile">
                <div className="stat-label">{sev}</div>
                <div className="stat-value">{count as number}</div>
              </div>
            ))}
          </div>
        )}
        {events.length === 0 ? (
          <p className="muted">No events in stream.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Severity</th><th>Category</th><th>Source</th><th>Message</th><th>Hint</th><th>Ack</th><th>Time</th></tr>
            </thead>
            <tbody>
              {events.slice(0, 50).map((evt: UoEvent) => (
                <tr key={evt.id} className={severityClass(evt.severity)}>
                  <td><strong>{evt.severity}</strong></td>
                  <td>{evt.category}</td>
                  <td>{evt.source}</td>
                  <td>{evt.message}</td>
                  <td>{evt.workflowHint ? <code>{evt.workflowHint}</code> : "—"}</td>
                  <td>{evt.acknowledged ? "✅" : "⬜"}</td>
                  <td>{ts(evt.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 9. Workflow History ───────────────────────────────────────── */}
      <section className="card">
        <h2>📋 Workflow History</h2>
        {wfStats && (
          <div className="stats-grid" style={{marginBottom: "1rem"}}>
            <div className="stat-tile"><div className="stat-label">Total Runs</div><div className="stat-value">{wfStats.total}</div></div>
            <div className="stat-tile"><div className="stat-label">Completed</div><div className="stat-value status-good">{wfStats.completed}</div></div>
            <div className="stat-tile"><div className="stat-label">Failed</div><div className="stat-value status-bad">{wfStats.failed}</div></div>
            <div className="stat-tile"><div className="stat-label">Active Now</div><div className="stat-value">{wfStats.active}</div></div>
          </div>
        )}
        {wfHistory.length === 0 ? (
          <p className="muted">No workflow history.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Playbook</th><th>Status</th><th>Triggered By</th><th>Steps</th><th>Duration</th><th>Started</th></tr>
            </thead>
            <tbody>
              {wfHistory.map((wf: UoWorkflowRun) => {
                const dur = wf.completedAt ? ms(wf.completedAt - wf.startedAt) : "in progress";
                const stepsOk = wf.steps.filter((s: UoWorkflowStep) => s.status === "completed").length;
                return (
                  <tr key={wf.id} className={workflowStatusClass(wf.status)}>
                    <td><code>{wf.playbook}</code></td>
                    <td>{wf.status}</td>
                    <td>{wf.triggeredBy}</td>
                    <td>{stepsOk}/{wf.steps.length} steps ok</td>
                    <td>{dur}</td>
                    <td>{ts(wf.startedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── 10. API Reference ─────────────────────────────────────────── */}
      <section className="card">
        <h2>📖 API Reference</h2>
        <p className="muted">All endpoints served by <code>ghostbrain-uo</code> on port <strong>9990</strong></p>
        <table className="data-table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Description</th></tr>
          </thead>
          <tbody>
            {[
              ["GET",    "/health",                    "Liveness probe — service name, port, uptime"],
              ["GET",    "/status",                    "Full orchestrator status snapshot (all subsystem stats)"],
              ["GET",    "/systems",                   "Health of all 26 subsystems + healthy/total count"],
              ["GET",    "/systems/:name",             "Health of one specific subsystem by name"],
              ["POST",   "/systems/check",             "Force immediate health check of all subsystems"],
              ["POST",   "/command",                   "Issue a command: { target, action, params?, priority?, source?, requester? }"],
              ["GET",    "/commands",                  "Command history + stats (?limit=N)"],
              ["GET",    "/routing-table",             "Full decision routing table (all 14 decision types → primary+secondary services)"],
              ["POST",   "/route",                     "Route a decision: { type?, payload } → returns route result"],
              ["GET",    "/routes",                    "Route dispatch history + stats (?limit=N)"],
              ["GET",    "/workflows",                 "Active + recent workflows, stats, available playbook list (?limit=N)"],
              ["POST",   "/workflow/:name",            "Execute a named playbook: { params?, triggeredBy? }"],
              ["GET",    "/tasks",                     "All scheduled tasks + stats + recent history (?enabled=true|false)"],
              ["POST",   "/tasks",                     "Add a new task: { type, label, targetUrl, endpoint, method?, intervalMs?, maxRetries? }"],
              ["DELETE", "/tasks/:id",                 "Cancel (disable) a task by ID"],
              ["GET",    "/events",                    "Event stream with filters: ?category=&severity=&limit=&since=(epochMs)"],
              ["POST",   "/events/ingest",             "Ingest an external event: { message, source, payload? }"],
              ["POST",   "/events/acknowledge/:id",    "Acknowledge an event by ID (removes from critical queue)"],
            ].map(([method, path, desc]) => (
              <tr key={`${method}-${path}`}>
                <td><code>{method}</code></td>
                <td><code>{path}</code></td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

"use client";
import useSWR from "swr";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentDecision {
  id:        string;
  agentId:   string;
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  timestamp: number;
}

interface RegisteredAgent {
  id:             string;
  name:           string;
  domain:         string;
  icon:           string;
  status:         "idle" | "running" | "error" | "paused" | "booting";
  version:        string;
  lastRun:        number;
  tasksCompleted: number;
  tasksActive:    number;
  tasksFailed:    number;
  cycleCount:     number;
  autonomyLevel:  number;
  capabilities:   string[];
  decisions:      AgentDecision[];
}

interface NetworkSummary {
  networkHealth: string;
  autonomyScore: number;
  agents: { total: number; running: number; idle: number; error: number; paused: number };
  tasks:    { total: number; pending: number; inProgress: number; completed: number };
  messages: { total: number; unread: number };
}

interface GaanData {
  summary:   NetworkSummary | null;
  agents:    { agents: RegisteredAgent[]; total: number } | null;
  decisions: { decisions: AgentDecision[]; total: number } | null;
  tasks:     { tasks: unknown[]; stats: unknown } | null;
  messages:  { messages: unknown[]; stats: unknown } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const IMPACT_BADGE: Record<string, string> = {
  low:      "badge-green",
  medium:   "badge-yellow",
  high:     "badge-red",
  critical: "badge-red",
};

const STATUS_BADGE: Record<string, string> = {
  idle:    "badge-green",
  running: "badge-cyan",
  error:   "badge-red",
  paused:  "badge-yellow",
  booting: "badge-yellow",
};

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "#10b981",
  degraded: "#f59e0b",
  critical: "#ef4444",
};

const ROLE_AGENTS  = new Set(["architect-agent", "auditor-agent", "defender-agent", "strategist-agent", "operator-agent"]);
const DOMAIN_AGENTS = new Set(["infrastructure-agent", "security-agent", "marketing-agent", "growth-agent", "governance-agent", "economy-agent", "interchain-agent"]);

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ── Sub-component: Agent card ─────────────────────────────────────────────────
function AgentCard({ agent }: { agent: RegisteredAgent }) {
  const recentDecision = agent.decisions?.[0] ?? null;
  return (
    <div className="card" style={{ padding: "0.85rem 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "1.4rem", marginRight: "0.35rem" }}>{agent.icon}</span>
          <span style={{ fontWeight: 600 }}>{agent.name}</span>
          {ROLE_AGENTS.has(agent.id) && (
            <span className="badge badge-purple" style={{ marginLeft: "0.4rem", fontSize: "0.65rem" }}>ROLE</span>
          )}
        </div>
        <span className={`badge ${STATUS_BADGE[agent.status] ?? "badge-gray"}`}>
          <span className="dot" />{agent.status}
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <strong>{agent.tasksCompleted}</strong> tasks · <strong>{agent.cycleCount}</strong> cycles
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Autonomy: <strong>{agent.autonomyLevel}%</strong>
        </div>
        {agent.lastRun > 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Last: {timeSince(agent.lastRun)}
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.4rem" }}>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${agent.autonomyLevel}%`, background: "#7c3aed" }} />
        </div>
      </div>

      {recentDecision && (
        <div style={{
          marginTop: "0.55rem", padding: "0.4rem 0.5rem",
          background: "var(--bg-secondary)", borderRadius: "4px", fontSize: "0.75rem",
        }}>
          <span className={`badge ${IMPACT_BADGE[recentDecision.impact]}`} style={{ marginRight: "0.35rem", fontSize: "0.65rem" }}>
            {recentDecision.impact}
          </span>
          <strong>{recentDecision.action}</strong>
          <div style={{ color: "var(--text-muted)", marginTop: "0.15rem", lineHeight: "1.3" }}>
            {recentDecision.outcome.length > 100
              ? recentDecision.outcome.slice(0, 100) + "…"
              : recentDecision.outcome}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const { data, isLoading, mutate } = useSWR<GaanData>(
    "/api/agents/status",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const summary   = data?.summary   ?? null;
  const agentList = data?.agents?.agents ?? [];
  const decisions = data?.decisions?.decisions ?? [];
  const gaanOnline = !isLoading && !!summary;

  const roleAgents   = agentList.filter(a => ROLE_AGENTS.has(a.id));
  const domainAgents = agentList.filter(a => DOMAIN_AGENTS.has(a.id));

  const recentDecisions = [...decisions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 15);

  const agentMap = new Map<string, RegisteredAgent>();
  for (const a of agentList) agentMap.set(a.id, a);

  return (
    <>
      <div className="page-header">
        <h1>🤖 AI Agent Network</h1>
        <p>Ghost Autonomous AI Agent Network (GAAN) · 12 agents · real-time coordination</p>
      </div>

      {/* Status bar */}
      <div className="flex-between" style={{ marginBottom: "1rem" }}>
        <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
          <span className={`badge ${gaanOnline ? "badge-green" : "badge-red"}`}>
            <span className="dot" />{gaanOnline ? "GAAN online" : "GAAN offline (port 9981)"}
          </span>
          {summary && (
            <>
              <span className="badge badge-purple">
                {summary.agents.total} agents
              </span>
              <span style={{ color: HEALTH_COLOR[summary.networkHealth] ?? "var(--text-muted)" }}
                className="badge badge-gray">
                {summary.networkHealth}
              </span>
              <span className="badge badge-cyan">Autonomy {summary.autonomyScore}%</span>
              {summary.agents.running > 0 && (
                <span className="badge badge-cyan">{summary.agents.running} running</span>
              )}
              {summary.agents.error > 0 && (
                <span className="badge badge-red">{summary.agents.error} errors</span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost" onClick={() => mutate()}>↻ Refresh</button>
        </div>
      </div>

      {/* Offline notice */}
      {!isLoading && !gaanOnline && (
        <div className="card" style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>
          GAAN service is offline. Start with <span className="mono">make agents-dev</span> (port 9981).
        </div>
      )}

      {/* ── Network KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-label">Total Agents</div>
          <div className="stat-value">{summary?.agents.total ?? "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {summary ? `${roleAgents.length} role · ${domainAgents.length} domain` : ""}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Decisions Made</div>
          <div className="stat-value">{data?.decisions?.total ?? "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>across all agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Tasks</div>
          <div className="stat-value">{summary?.tasks?.inProgress ?? "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {summary ? `${summary.tasks.pending} pending` : ""}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Messages</div>
          <div className="stat-value">{summary?.messages?.total ?? "—"}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {summary ? `${summary.messages.unread} unread` : ""}
          </div>
        </div>
      </div>

      {/* ── Role-based agents ──────────────────────────────────────────────── */}
      <div className="card-title" style={{ marginBottom: "0.6rem" }}>
        ♟️ Role-Based Agents <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          — Architect · Auditor · Defender · Strategist · Operator
        </span>
      </div>

      {isLoading && <div style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>Loading agents…</div>}

      {roleAgents.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: "1.5rem" }}>
          {roleAgents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      )}

      {!isLoading && roleAgents.length === 0 && (
        <div className="card" style={{ marginBottom: "1.5rem", color: "var(--text-muted)" }}>
          No role-based agents returned. GAAN may be starting up — try refreshing.
        </div>
      )}

      {/* ── Domain agents ──────────────────────────────────────────────────── */}
      <div className="card-title" style={{ marginBottom: "0.6rem" }}>
        🏛️ Domain Agents <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          — Infrastructure · Security · Marketing · Growth · Governance · Economy · Interchain
        </span>
      </div>

      {domainAgents.length > 0 && (
        <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
          {domainAgents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      )}

      {/* ── Recent decisions ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">
          📋 Recent Decisions
          <span style={{ float: "right", fontWeight: 400, fontSize: "0.75rem" }}>
            Latest {recentDecisions.length} of {data?.decisions?.total ?? 0}
          </span>
        </div>

        {recentDecisions.length === 0 && !isLoading && (
          <div style={{ color: "var(--text-muted)" }}>No decisions recorded yet.</div>
        )}

        {recentDecisions.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Action</th>
                <th>Impact</th>
                <th>Outcome</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentDecisions.map(d => {
                const agent = agentMap.get(d.agentId);
                return (
                  <tr key={d.id}>
                    <td>
                      <span style={{ marginRight: "0.3rem" }}>{agent?.icon ?? "🤖"}</span>
                      {agent?.name ?? d.agentId}
                    </td>
                    <td style={{ fontWeight: 500 }}>{d.action}</td>
                    <td>
                      <span className={`badge ${IMPACT_BADGE[d.impact]}`}>{d.impact}</span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {d.outcome.length > 90 ? d.outcome.slice(0, 90) + "…" : d.outcome}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                      {timeSince(d.timestamp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {isLoading && <div style={{ color: "var(--text-muted)" }}>Loading…</div>}
      </div>

      {/* ── Autonomy breakdown bar ─────────────────────────────────────────── */}
      {agentList.length > 0 && (
        <div className="card">
          <div className="card-title">🧠 Agent Autonomy Levels</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {[...agentList]
              .sort((a, b) => b.autonomyLevel - a.autonomyLevel)
              .map(agent => (
                <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "160px", fontSize: "0.8rem", flexShrink: 0 }}>
                    {agent.icon} {agent.name.replace(" Agent", "")}
                  </div>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${agent.autonomyLevel}%`,
                        background: ROLE_AGENTS.has(agent.id) ? "#7c3aed" : "#2563eb",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", width: "35px", textAlign: "right" }}>
                    {agent.autonomyLevel}%
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}

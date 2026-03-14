"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchGaanSummary,
  fetchGaanAgents,
  fetchGaanTasks,
  fetchGaanMessages,
  fetchGaanDecisions,
  type GaanAgent,
  type GaanTask,
  type GaanMessage,
  type GaanDecision,
} from "@/lib/api";

// ── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const DOMAIN_ICON: Record<string, string> = {
  infrastructure: "🖥️",
  security:       "🛡️",
  marketing:      "📣",
  growth:         "🌱",
  governance:     "⚖️",
  economy:        "💰",
  interchain:     "🔗",
};

const STATUS_COLOR: Record<string, string> = {
  idle:    "#22c55e",
  running: "#3b82f6",
  error:   "#ef4444",
  paused:  "#f59e0b",
  booting: "#8b5cf6",
};

const IMPACT_STYLE: Record<string, { bg: string; text: string }> = {
  low:      { bg: "#1a2e1a", text: "#4ade80" },
  medium:   { bg: "#1a2200", text: "#facc15" },
  high:     { bg: "#2e1a00", text: "#fb923c" },
  critical: { bg: "#2e0a0a", text: "#f87171" },
};

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  low:      { bg: "#1a2e1a", text: "#4ade80" },
  medium:   { bg: "#1a2200", text: "#facc15" },
  high:     { bg: "#2e1a00", text: "#fb923c" },
  critical: { bg: "#2e0a0a", text: "#f87171" },
};

const MSG_TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  info:      { bg: "#1a2e3e", text: "#38bdf8" },
  alert:     { bg: "#2e0a0a", text: "#f87171" },
  command:   { bg: "#1a2200", text: "#facc15" },
  response:  { bg: "#1a2e1a", text: "#4ade80" },
  broadcast: { bg: "#2a1a3e", text: "#c084fc" },
};

// ── components ────────────────────────────────────────────────────────────────
function Badge({ label, style }: { label: string; style: { bg: string; text: string } }) {
  return (
    <span style={{
      background: style.bg, color: style.text,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.02em", textTransform: "uppercase" as const,
    }}>{label}</span>
  );
}

function AgentCard({ agent }: { agent: GaanAgent }) {
  const lastDecision = agent.decisions[agent.decisions.length - 1];
  const autonomyPct  = agent.autonomyLevel;
  return (
    <div style={{
      background: "#111", border: "1px solid #222", borderRadius: 10,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 28 }}>{DOMAIN_ICON[agent.domain] ?? "🤖"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#e5e5e5" }}>{agent.name}</span>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: STATUS_COLOR[agent.status] ?? "#888",
              display: "inline-block", flexShrink: 0,
            }} />
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            {agent.domain} · v{agent.version} · {agent.cycleCount} cycles
          </div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ color: STATUS_COLOR[agent.status] ?? "#888", fontWeight: 700, fontSize: 12, textTransform: "uppercase" as const }}>
            {agent.status}
          </div>
        </div>
      </div>

      {/* autonomy bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 4 }}>
          <span>Autonomy</span><span style={{ color: "#a3e635" }}>{autonomyPct}%</span>
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(90deg,#16a34a,#a3e635)", width: `${autonomyPct}%`, height: "100%", borderRadius: 4 }} />
        </div>
      </div>

      {/* task stats */}
      <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
        <span style={{ color: "#4ade80" }}>✓ {agent.tasksCompleted}</span>
        <span style={{ color: "#3b82f6" }}>⟳ {agent.tasksActive}</span>
        <span style={{ color: "#f87171" }}>✗ {agent.tasksFailed}</span>
      </div>

      {/* capabilities */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
        {agent.capabilities.slice(0, 4).map(cap => (
          <span key={cap} style={{ background: "#1a1a2e", color: "#818cf8", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>{cap}</span>
        ))}
      </div>

      {/* last decision */}
      {lastDecision && (
        <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 6, padding: "8px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Badge label={lastDecision.impact} style={IMPACT_STYLE[lastDecision.impact] ?? IMPACT_STYLE.low} />
            <span style={{ fontSize: 10, color: "#555" }}>{timeAgo(lastDecision.timestamp)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#d4d4d4", lineHeight: 1.4 }}>{lastDecision.action}</div>
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [summary,   setSummary]   = useState<Awaited<ReturnType<typeof fetchGaanSummary>>>(null);
  const [agents,    setAgents]    = useState<GaanAgent[]>([]);
  const [tasks,     setTasks]     = useState<GaanTask[]>([]);
  const [messages,  setMessages]  = useState<GaanMessage[]>([]);
  const [decisions, setDecisions] = useState<GaanDecision[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<"tasks" | "bus" | "decisions">("tasks");

  const load = useCallback(async () => {
    const [s, a, t, m, d] = await Promise.all([
      fetchGaanSummary(),
      fetchGaanAgents(),
      fetchGaanTasks({ limit: 30 }),
      fetchGaanMessages({ limit: 30 }),
      fetchGaanDecisions({ limit: 40 }),
    ]);
    if (s) setSummary(s);
    if (a) setAgents(a);
    if (t) setTasks(t);
    if (m) setMessages(m);
    if (d) setDecisions(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 15_000); return () => clearInterval(iv); }, [load]);

  const health       = summary?.networkHealth ?? 0;
  const autonomy     = summary?.autonomyScore ?? 0;
  const agentsTotal  = summary?.agents.total ?? 7;
  const agentsActive = (summary?.agents.running ?? 0) + (summary?.agents.idle ?? 0);
  const cycleCount   = summary?.cycleCount ?? 0;

  const healthColor = health >= 85 ? "#4ade80" : health >= 60 ? "#facc15" : "#f87171";

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>

      {/* header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: "#fff" }}>
          🤖 Ghost Autonomous AI Agent Network
        </h1>
        <p style={{ color: "#666", margin: "6px 0 0", fontSize: 14 }}>
          Multi-agent AI operating system coordinating all GhostChain engines autonomously
        </p>
      </div>

      {/* network health banner */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14,
        marginBottom: 28,
      }}>
        {[
          { label: "Network Health",  value: loading ? "—" : `${health}/100`,       color: healthColor },
          { label: "Autonomy Score",  value: loading ? "—" : `${autonomy}%`,         color: "#a3e635" },
          { label: "Agents Online",   value: loading ? "—" : `${agentsActive}/${agentsTotal}`, color: "#38bdf8" },
          { label: "Coordination Cycles", value: loading ? "—" : String(cycleCount), color: "#c084fc" },
        ].map(m => (
          <div key={m.label} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* health progress bar */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ background: "#1a1a1a", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div style={{
            background: `linear-gradient(90deg, ${health >= 85 ? "#16a34a" : health >= 60 ? "#ca8a04" : "#dc2626"}, ${healthColor})`,
            width: `${health}%`, height: "100%", borderRadius: 6,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* agent cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14, marginBottom: 32 }}>
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, height: 200, animation: "pulse 2s infinite" }} />
            ))
          : agents.map(agent => <AgentCard key={agent.id} agent={agent} />)
        }
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #222", paddingBottom: 1 }}>
        {(["tasks", "bus", "decisions"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", borderRadius: "6px 6px 0 0", border: "none",
            background: tab === t ? "#1a1a2e" : "transparent",
            color: tab === t ? "#818cf8" : "#666", fontWeight: tab === t ? 700 : 400,
            cursor: "pointer", fontSize: 13, textTransform: "capitalize" as const,
          }}>
            {t === "tasks" ? `Task Queue (${tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length})` :
             t === "bus"   ? `Agent Bus (${messages.length})` :
                             `Decisions (${decisions.length})`}
          </button>
        ))}
      </div>

      {/* task queue */}
      {tab === "tasks" && (
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0a0a0a", color: "#666" }}>
                {["Priority", "Domain", "Assignee", "Status", "Title", "Age"].map(h => (
                  <th key={h} style={{ textAlign: "left" as const, padding: "10px 14px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").map((task, i) => (
                <tr key={task.id} style={{ borderTop: "1px solid #1a1a1a", background: i % 2 === 0 ? "transparent" : "#0d0d0d" }}>
                  <td style={{ padding: "10px 14px" }}><Badge label={task.priority} style={PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low} /></td>
                  <td style={{ padding: "10px 14px", color: "#888" }}>{task.domain ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#a5b4fc", fontSize: 12 }}>{task.assignedTo ? task.assignedTo.replace("-agent", "") : <span style={{ color: "#555" }}>unassigned</span>}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      color: task.status === "in-progress" ? "#3b82f6" : task.status === "failed" ? "#ef4444" : "#888",
                      fontWeight: 600, fontSize: 12, textTransform: "uppercase" as const,
                    }}>{task.status}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#d4d4d4", maxWidth: 360 }}>{task.title}</td>
                  <td style={{ padding: "10px 14px", color: "#555", fontSize: 12 }}>{timeAgo(task.createdAt)}</td>
                </tr>
              ))}
              {tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length === 0 && (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: "center" as const, color: "#555" }}>No active tasks</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* agent bus */}
      {tab === "bus" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.slice(0, 25).map(msg => (
            <div key={msg.id} style={{
              background: "#111", border: "1px solid #222", borderRadius: 8, padding: "12px 16px",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <Badge label={msg.type} style={MSG_TYPE_STYLE[msg.type] ?? MSG_TYPE_STYLE.info} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 600 }}>{msg.from}</span>
                  <span style={{ color: "#555", fontSize: 11 }}>→</span>
                  <span style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 600 }}>{msg.to}</span>
                  <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>{timeAgo(msg.timestamp)}</span>
                </div>
                <div style={{ fontSize: 13, color: "#d4d4d4", fontWeight: 600, marginBottom: 2 }}>{msg.subject}</div>
                <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{msg.content}</div>
              </div>
            </div>
          ))}
          {messages.length === 0 && <div style={{ textAlign: "center", color: "#555", padding: 24 }}>No messages yet</div>}
        </div>
      )}

      {/* decisions */}
      {tab === "decisions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {decisions.map(dec => {
            const agent = agents.find(a => a.id === dec.agentId);
            return (
              <div key={dec.id} style={{
                background: "#111", border: "1px solid #222", borderRadius: 8, padding: "12px 16px",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{agent ? (DOMAIN_ICON[agent.domain] ?? "🤖") : "🤖"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Badge label={dec.impact} style={IMPACT_STYLE[dec.impact] ?? IMPACT_STYLE.low} />
                    <span style={{ color: "#888", fontSize: 12, fontWeight: 600 }}>{dec.agentId.replace("-agent", "")}</span>
                    <span style={{ color: "#555", fontSize: 11, marginLeft: "auto" }}>{timeAgo(dec.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#e5e5e5", fontWeight: 700, marginBottom: 2 }}>{dec.action}</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{dec.reasoning}</div>
                  {dec.outcome && <div style={{ fontSize: 12, color: "#4ade80" }}>{dec.outcome}</div>}
                </div>
              </div>
            );
          })}
          {decisions.length === 0 && <div style={{ textAlign: "center", color: "#555", padding: 24 }}>No decisions recorded yet</div>}
        </div>
      )}
    </div>
  );
}

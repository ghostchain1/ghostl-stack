"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchGovernorState,
  fetchGovernorDecisions,
  type GovernorState,
  type GovernorDecision,
  type AgentStatus,
} from "@/lib/api";
import { formatGst } from "@/lib/utils";
import { Brain, Activity, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  economy:        "Economy",
  security:       "Security",
  discovery:      "Discovery",
  event:          "Events",
  infrastructure: "Infrastructure",
  treasury:       "Treasury",
};

const SEVERITY_STYLES: Record<string, string> = {
  info:     "bg-blue-900/30 text-blue-300 border-blue-700",
  warning:  "bg-yellow-900/30 text-yellow-300 border-yellow-700",
  critical: "bg-red-900/30 text-red-300 border-red-700",
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  info:     <Activity size={13} />,
  warning:  <AlertTriangle size={13} />,
  critical: <ShieldCheck size={13} />,
};

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── sub-components ─────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentStatus }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{AGENT_LABELS[agent.name] ?? agent.name}</span>
        {agent.healthy
          ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={13} /> OK</span>
          : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={13} /> Error</span>}
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
        <span>Decisions</span> <span className="text-white">{agent.decisions}</span>
        <span>Last run</span>  <span className="text-white">{agent.lastRunMs}ms</span>
      </div>
      {agent.lastError && (
        <div className="text-xs text-red-400 mt-1 truncate" title={agent.lastError}>
          {agent.lastError}
        </div>
      )}
    </div>
  );
}

function DecisionRow({ d }: { d: GovernorDecision }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs ${SEVERITY_STYLES[d.severity]}`}>
      <span className="mt-0.5 shrink-0">{SEVERITY_ICONS[d.severity]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold uppercase tracking-wide">{AGENT_LABELS[d.agent] ?? d.agent}</span>
          <span className="opacity-60">·</span>
          <span className="font-mono">{d.action}</span>
        </div>
        <div className="text-gray-300 leading-snug">{d.reason}</div>
      </div>
      <span className="shrink-0 opacity-50 flex items-center gap-1 mt-0.5">
        <Clock size={11} /> {timeAgo(d.timestamp)}
      </span>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

export default function GhostBrainPage() {
  const { data: state, isError: stateError } = useQuery<GovernorState>({
    queryKey:        ["governor-state"],
    queryFn:         fetchGovernorState,
    refetchInterval: 10_000,
  });

  const { data: decisions = [] } = useQuery<GovernorDecision[]>({
    queryKey:        ["governor-decisions"],
    queryFn:         fetchGovernorDecisions,
    refetchInterval: 10_000,
  });

  const criticalCount = decisions.filter(d => d.severity === "critical").length;
  const warningCount  = decisions.filter(d => d.severity === "warning").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain size={28} className="text-brand-purple" />
        <div>
          <h1 className="text-xl font-bold">GhostBrain Governor</h1>
          <p className="text-xs text-gray-500">Autonomous Platform AI · GhostL3 chain 903</p>
        </div>
        {state && (
          <span className={`ml-auto flex items-center gap-2 text-sm px-3 py-1 rounded-full font-semibold ${
            state.running ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
          }`}>
            <Activity size={14} />
            {state.running ? "Active" : "Stopped"}
          </span>
        )}
      </div>

      {stateError && (
        <div className="card border-red-700 text-red-400 text-sm">
          GhostBrain service unreachable — make sure the AI service is running on port 7002.
        </div>
      )}

      {/* Top metric strip */}
      {state && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatPill label="Uptime"       value={fmtUptime(state.uptime)} />
          <StatPill label="Cycles run"   value={state.cycleCount.toString()} />
          <StatPill label="Critical alerts" value={criticalCount.toString()} highlight={criticalCount > 0 ? "red" : undefined} />
          <StatPill label="Warnings"     value={warningCount.toString()}  highlight={warningCount > 0 ? "yellow" : undefined} />
        </div>
      )}

      {/* Platform metrics */}
      {state?.metrics && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Platform Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatPill label="Live streams"     value={state.metrics.liveStreams.toString()} />
            <StatPill label="Total users"      value={state.metrics.totalUsers.toLocaleString()} />
            <StatPill label="24h GST volume"   value={formatGst(state.metrics.gstVolume24h)} />
            <StatPill label="Reward ×"         value={`${state.metrics.rewardMultiplier.toFixed(1)}x`} />
            <StatPill label="Settlement queue" value={state.metrics.settlementQueueDepth.toString()} highlight={state.metrics.settlementQueueDepth > 30 ? "yellow" : undefined} />
          </div>
        </section>
      )}

      {/* Agent cards */}
      {state?.agents && state.agents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Agent Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {state.agents.map(a => <AgentCard key={a.name} agent={a} />)}
          </div>
        </section>
      )}

      {/* Decision feed */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
          Decision Feed <span className="normal-case text-gray-600 font-normal">(last 100, newest first)</span>
        </h2>
        {decisions.length === 0 ? (
          <div className="card text-sm text-gray-500">
            No decisions recorded yet — waiting for first governor cycle (30s interval).
          </div>
        ) : (
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {decisions.map((d, i) => <DecisionRow key={i} d={d} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function StatPill({
  label, value, highlight,
}: {
  label: string; value: string; highlight?: "red" | "yellow";
}) {
  const color = highlight === "red"
    ? "text-red-400"
    : highlight === "yellow"
    ? "text-yellow-400"
    : "text-white";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  );
}

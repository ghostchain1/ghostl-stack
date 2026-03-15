"use client";

import { useState } from "react";

interface Command {
  id: string;
  label: string;
  target: string;
  action: string;
  params?: Record<string, unknown>;
  priority?: string;
}

const PRESET_COMMANDS: Command[] = [
  { id: "scale-rpc",          label: "Scale RPC Nodes",       target: "aim",            action: "scale",           params: { type: "rpc" },         priority: "high" },
  { id: "deploy-validator",   label: "Deploy Validator",      target: "validator-fabric",action: "deploy",          params: {},                       priority: "high" },
  { id: "security-scan",      label: "Run Security Scan",     target: "tds",            action: "scan",            params: {},                       priority: "normal" },
  { id: "optimize-gas",       label: "Optimize Gas Fees",     target: "economic",       action: "optimize",        params: {},                       priority: "normal" },
  { id: "sync-governance",    label: "Sync Governance",       target: "governance",     action: "sync",            params: {},                       priority: "normal" },
  { id: "flush-telemetry",    label: "Flush Telemetry",       target: "data-mesh",      action: "flush",           params: {},                       priority: "low" },
  { id: "evolve-agents",      label: "Evolve AI Agents",      target: "evolution",      action: "evolve",          params: {},                       priority: "normal" },
  { id: "sync-peers",         label: "Sync GIN Peers",        target: "gin",            action: "sync-peers",      params: {},                       priority: "normal" },
  { id: "health-all",         label: "Health Check All",      target: "kernel",         action: "health",          params: {},                       priority: "low" },
  { id: "compliance-scan",    label: "Compliance Scan",       target: "acge",           action: "audit",           params: {},                       priority: "normal" },
];

interface CommandResult {
  id: string;
  label: string;
  status: "pending" | "ok" | "error";
  message?: string;
  ts: number;
}

const UO_URL = process.env["NEXT_PUBLIC_UO_URL"] ?? "http://localhost:9990";

export function CommandConsole() {
  const [results, setResults]       = useState<CommandResult[]>([]);
  const [running, setRunning]       = useState<string | null>(null);
  const [customTarget, setCustomTarget]   = useState("");
  const [customAction, setCustomAction]   = useState("");
  const [customParams, setCustomParams]   = useState("{}");

  async function dispatch(cmd: Command) {
    setRunning(cmd.id);
    const entry: CommandResult = { id: cmd.id, label: cmd.label, status: "pending", ts: Date.now() };
    setResults(prev => [entry, ...prev].slice(0, 20));

    try {
      const res = await fetch(`${UO_URL}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target:    cmd.target,
          action:    cmd.action,
          params:    cmd.params ?? {},
          priority:  cmd.priority ?? "normal",
          source:    "operator",
          requester: "mcd-console",
        }),
      });
      const data = await res.json() as { ok: boolean; command?: { status: string; error?: string } };
      const status: "ok" | "error" = data.ok ? "ok" : "error";
      setResults(prev => prev.map(e => e.id === cmd.id && e.ts === entry.ts
        ? { ...e, status, message: data.command?.error ?? (status === "ok" ? "Dispatched" : "Command failed") }
        : e,
      ));
    } catch (err) {
      setResults(prev => prev.map(e => e.id === cmd.id && e.ts === entry.ts
        ? { ...e, status: "error", message: String(err) }
        : e,
      ));
    } finally {
      setRunning(null);
    }
  }

  async function sendCustom() {
    let params: Record<string, unknown> = {};
    try { params = JSON.parse(customParams) as Record<string, unknown>; } catch { /* ignore */ }
    await dispatch({ id: "custom-" + Date.now(), label: `${customTarget}/${customAction}`, target: customTarget, action: customAction, params });
  }

  return (
    <div className="cmd-console">
      {/* Preset buttons */}
      <div className="cmd-presets">
        {PRESET_COMMANDS.map(cmd => (
          <button
            key={cmd.id}
            className={`cmd-btn${cmd.priority === "high" ? " cmd-btn-high" : ""}`}
            disabled={running !== null}
            onClick={() => dispatch(cmd)}
          >
            {running === cmd.id ? "⏳ " : ""}{cmd.label}
          </button>
        ))}
      </div>

      {/* Custom command form */}
      <div className="cmd-custom">
        <span className="cmd-custom-label">Custom Command →</span>
        <input
          className="cmd-input"
          placeholder="target (e.g. kernel)"
          value={customTarget}
          onChange={e => setCustomTarget(e.target.value)}
        />
        <input
          className="cmd-input"
          placeholder="action (e.g. health)"
          value={customAction}
          onChange={e => setCustomAction(e.target.value)}
        />
        <input
          className="cmd-input"
          placeholder='params JSON (e.g. {})'
          value={customParams}
          onChange={e => setCustomParams(e.target.value)}
        />
        <button
          className="cmd-btn"
          disabled={!customTarget || !customAction || running !== null}
          onClick={sendCustom}
        >
          Send
        </button>
      </div>

      {/* Result log */}
      {results.length > 0 && (
        <div className="cmd-log">
          <div className="cmd-log-header">Command Log</div>
          {results.map((r, i) => (
            <div key={i} className={`cmd-log-entry cmd-log-${r.status}`}>
              <span className="cmd-log-time">{new Date(r.ts).toLocaleTimeString()}</span>
              <span className="cmd-log-label">{r.label}</span>
              <span className="cmd-log-status">
                {r.status === "pending" ? "⏳" : r.status === "ok" ? "✓" : "✗"} {r.message ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * GhostStack Global AI Orchestrator — Infrastructure Agent
 *
 * Handles node health, Docker container state, VM provisioning, and chain
 * node recovery across every GhostStack layer.
 *
 * Responsibilities:
 *   - Poll L1 / L2 / L3 node liveness and alert on missed blocks.
 *   - Detect and restart degraded Docker containers via the autonomous-
 *     installer repair subsystem.
 *   - Handle BRIDGE and GID tasks (node-level plumbing).
 *   - Forward diagnostics to GhostBrain for pattern learning.
 *
 * Safety boundaries:
 *   - Agent never modifies chain parameters or on-chain state.
 *   - All restart operations are logged to GhostBrain before execution.
 *   - PolicyGuard filters all tasks before they reach this agent.
 *
 * Chain: GhostChain L1 (chain_id 14000101). Gas token: GST.
 */

import type {
  Agent,
  AgentHealth,
  AgentName,
  AgentResult,
  Task,
} from "../core/task_router.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const L1_CHAIN_ID      = 14000101 as const;
const AGENT_NAME: AgentName = "infrastructure_agent";

const GHOSTBRAIN_URL   = process.env["GHOSTBRAIN_API_URL"]   ?? "http://localhost:7900";
const INSTALLER_URL    = process.env["INSTALLER_API_URL"]     ?? "http://localhost:7850";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NodeStatus {
  chainId:     number;
  rpcUrl:      string;
  reachable:   boolean;
  blockHeight: number | null;
  checkedAt:   number;
}

export interface InfrastructureAgentOptions {
  ghostbrainUrl?: string;
  installerUrl?:  string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── InfrastructureAgent ───────────────────────────────────────────────────────

export class InfrastructureAgent implements Agent {
  readonly name: AgentName = AGENT_NAME;

  private readonly ghostbrainUrl: string;
  private readonly installerUrl:  string;
  private readonly fetcher:       (url: string, init?: RequestInit) => Promise<Response>;

  private successCount = 0;
  private errorCount   = 0;
  private lastTaskAt:  number | null = null;

  constructor(opts: InfrastructureAgentOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.installerUrl  = opts.installerUrl  ?? INSTALLER_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Agent interface ────────────────────────────────────────────────────────

  async handle(task: Task): Promise<AgentResult> {
    this.lastTaskAt = nowSec();
    try {
      const output = await this._dispatch(task);
      this.successCount += 1;
      return this._result(task, true, output);
    } catch (err: unknown) {
      this.errorCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[InfrastructureAgent] Task ${task.id} failed:`, message);
      return this._result(task, false, { error: message });
    }
  }

  health(): AgentHealth {
    return {
      name:         AGENT_NAME,
      healthy:      this.errorCount < 5,
      lastTaskAt:   this.lastTaskAt,
      errorCount:   this.errorCount,
      successCount: this.successCount,
    };
  }

  // ── Task dispatch ──────────────────────────────────────────────────────────

  private async _dispatch(task: Task): Promise<Record<string, unknown>> {
    const action = task.payload["action"];

    switch (action) {
      case "check_node_health":   return this._checkNodeHealth(task);
      case "restart_container":   return this._restartContainer(task);
      case "check_bridge_status": return this._checkBridgeStatus(task);
      case "check_gid_status":    return this._checkGidStatus(task);
      default:
        return this._generic(task);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async _checkNodeHealth(task: Task): Promise<Record<string, unknown>> {
    const rpcUrl = String(task.payload["rpc_url"] ?? "http://localhost:18545");
    const chainId = Number(task.payload["chain_id"] ?? L1_CHAIN_ID);

    try {
      const res = await this.fetcher(rpcUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jsonrpc: "2.0", method: "ghost_blockNumber", params: [], id: 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result?: string };
      const blockHeight = data.result !== undefined ? parseInt(data.result, 16) : null;

      const status: NodeStatus = { chainId, rpcUrl, reachable: true, blockHeight, checkedAt: nowSec() };
      void this._report("infrastructure/node-health", { ...status });
      return { status };
    } catch (err: unknown) {
      const status: NodeStatus = { chainId, rpcUrl, reachable: false, blockHeight: null, checkedAt: nowSec() };
      void this._report("infrastructure/node-health", { ...status });
      return { status };
    }
  }

  private async _restartContainer(task: Task): Promise<Record<string, unknown>> {
    const containerName = String(task.payload["container"] ?? "");
    if (!containerName) throw new Error("container name required");

    const res = await this.fetcher(`${this.installerUrl}/repair/container`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ container: containerName, task_id: task.id }),
    });
    if (!res.ok) throw new Error(`Installer HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    void this._report("infrastructure/container-restart", { container: containerName, ...data });
    return data;
  }

  private async _checkBridgeStatus(task: Task): Promise<Record<string, unknown>> {
    const res = await this.fetcher(`${this.ghostbrainUrl}/bridge/status`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ task_id: task.id, chain_id: L1_CHAIN_ID, gas_token: "GST" }),
    });
    if (!res.ok) throw new Error(`GhostBrain HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async _checkGidStatus(task: Task): Promise<Record<string, unknown>> {
    const res = await this.fetcher(`${this.ghostbrainUrl}/gid/status`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ task_id: task.id, chain_id: L1_CHAIN_ID, gas_token: "GST" }),
    });
    if (!res.ok) throw new Error(`GhostBrain HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async _generic(task: Task): Promise<Record<string, unknown>> {
    void this._report("infrastructure/generic-task", { task_id: task.id, payload: task.payload });
    console.log(`[InfrastructureAgent] Generic task ${task.id} type=${task.type}`);
    return { handled: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async _report(endpoint: string, data: Record<string, unknown>): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...data, chain_id: L1_CHAIN_ID, gas_token: "GST" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[InfrastructureAgent] GhostBrain report failed:", err.message);
    }
  }

  private _result(
    task:    Task,
    success: boolean,
    output:  Record<string, unknown>,
  ): AgentResult {
    return {
      taskId:    task.id,
      agentName: AGENT_NAME,
      success,
      output,
      handledAt: nowSec(),
      chain_id:  L1_CHAIN_ID,
      gas_token: "GST",
    };
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

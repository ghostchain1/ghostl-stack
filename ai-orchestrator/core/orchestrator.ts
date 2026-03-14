/**
 * GhostStack Global AI Orchestrator — Orchestrator
 *
 * Central command layer that unifies every AI system in the GhostStack:
 *   - GhostBrain Core       (port 7900)
 *   - Validator AI Network
 *   - Economic AI Engine    (L2 Revenue Aggregator, Treasury Engine, Reward Distributor)
 *   - Governance AI
 *   - Infrastructure / Self-Healing Installer
 *   - Interchain Bridge
 *   - Identity Network (GID)
 *
 * Settlement hierarchy (always enforced):
 *   L3 → L2 → GhostChain L1 (chain_id 14000101, gas token GST)
 *
 * Operation
 *   1. Callers submit Tasks via submit() or the GhostBrain pull loop.
 *   2. PolicyGuard evaluates every task before dispatch.
 *   3. TaskRouter resolves which agent should handle the task.
 *   4. The task is pushed onto the agent's queue and processed in order.
 *   5. AgentResults are aggregated and mirrored to GhostBrain.
 *   6. TaskScheduler drives the recurring cycle (health, telemetry, economics …).
 *   7. SystemTelemetry snapshots are published every telemetryIntervalMs.
 *
 * Safety
 *   - PolicyGuard hard-denies any governance-execution or slashing task.
 *   - CRITICAL tasks are held for human approval — never auto-executed.
 *   - Orchestrator holds at most MAX_QUEUE_DEPTH pending tasks to prevent memory
 *     pressure; excess tasks are dropped with a logged warning.
 */

import type { Agent, AgentResult, Task, TaskType } from "./task_router.js";
import { L1_CHAIN_ID, L2_CHAIN_ID, L3_CHAIN_ID, TaskRouter } from "./task_router.js";
import type { PolicyResult } from "../safety/policy_guard.js";
import { PolicyGuard }        from "../safety/policy_guard.js";
import { SystemTelemetry }    from "../telemetry/system_telemetry.js";
import { TaskScheduler }      from "../scheduler/task_scheduler.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const GHOSTBRAIN_URL          = process.env["GHOSTBRAIN_API_URL"]    ?? "http://localhost:7900";
const ORCHESTRATOR_INTERVAL_MS = Number(process.env["ORCH_INTERVAL_MS"] ?? "30000");
const TELEMETRY_INTERVAL_MS    = Number(process.env["ORCH_TELEMETRY_MS"] ?? "30000");
const GHOSTBRAIN_PULL_INTERVAL_MS = Number(process.env["ORCH_BRAIN_PULL_MS"] ?? "10000");

/** Maximum tasks held in queue at once (per agent) to bound memory consumption. */
const MAX_QUEUE_DEPTH = 500;

/** Maximum AgentResults kept in-memory history. */
const MAX_RESULT_HISTORY = 2_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  ghostbrainUrl?:         string;
  cycleIntervalMs?:       number;
  telemetryIntervalMs?:   number;
  brainPullIntervalMs?:   number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface OrchestratorStatus {
  running:        boolean;
  agentCount:     number;
  queueDepth:     number;
  resultCount:    number;
  successCount:   number;
  errorCount:     number;
  uptime_s:       number;
  chain_id:       number;
  gas_token:      string;
}

export interface GhostBrainTask {
  id:       string;
  task?:    Partial<Task>;
  type?:    TaskType;
  payload?: Record<string, unknown>;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class Orchestrator {
  private readonly agents     = new Map<string, Agent>();
  private readonly router     = new TaskRouter();
  private readonly guard:     PolicyGuard;
  private readonly telemetry: SystemTelemetry;
  private readonly scheduler: TaskScheduler;

  private readonly ghostbrainUrl:       string;
  private readonly fetcher:             (url: string, init?: RequestInit) => Promise<Response>;

  private readonly taskQueue:   Task[]          = [];
  private readonly resultLog:   AgentResult[]   = [];

  private running      = false;
  private startedAt:   number | null = null;
  private successCount = 0;
  private errorCount   = 0;

  constructor(opts: OrchestratorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));

    this.guard = new PolicyGuard({
      ghostbrainUrl: this.ghostbrainUrl,
      fetcher:       this.fetcher,
    });

    this.telemetry = new SystemTelemetry({
      ghostbrainUrl: this.ghostbrainUrl,
      fetcher:       this.fetcher,
    });

    this.scheduler = new TaskScheduler();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Register an agent. Must be called before start(). */
  register(agent: Agent): this {
    if (this.running) throw new Error("[Orchestrator] Cannot register agents after start()");
    if (this.agents.has(agent.name)) {
      console.warn(`[Orchestrator] Agent ${agent.name} already registered — skipping`);
      return this;
    }
    this.agents.set(agent.name, agent);
    this.telemetry.registerAgent(() => agent.health());
    console.log(`[Orchestrator] Registered agent: ${agent.name}`);
    return this;
  }

  /**
   * Submit a task for processing. PolicyGuard is checked immediately;
   * DENY'd tasks are returned with a result but never dispatched.
   */
  async submit(task: Task): Promise<AgentResult | PolicyResult> {
    const policy = await this.guard.check(task);
    if (policy.decision === "DENY") {
      console.warn(`[Orchestrator] Task ${task.id} DENY'd: ${policy.reason}`);
      return policy;
    }
    if (policy.decision === "REQUIRE_HUMAN_APPROVAL") {
      console.warn(`[Orchestrator] Task ${task.id} held for human approval: ${policy.reason}`);
      void this._notifyBrain("orchestrator/held-for-approval", {
        task_id:  task.id,
        task_type: task.type,
        reason:   policy.reason,
        chain_id: task.chain_id,
        gas_token: task.gas_token,
      });
      return policy;
    }

    if (this.taskQueue.length >= MAX_QUEUE_DEPTH) {
      console.error(`[Orchestrator] Queue full (${MAX_QUEUE_DEPTH}); dropping task ${task.id}`);
      return policy;
    }

    this.taskQueue.push(task);
    return this._drain();
  }

  /** Start the scheduler and GhostBrain pull loop. */
  start(): void {
    if (this.running) return;
    this.running   = true;
    this.startedAt = Math.floor(Date.now() / 1000);

    // Telemetry snapshot
    this.scheduler.schedule("telemetry:snapshot", TELEMETRY_INTERVAL_MS, async () => {
      const snap = await this.telemetry.collect();
      console.debug(`[Orchestrator] Telemetry snap: agents=${snap.agents.length}`);
    });

    // Pull tasks from GhostBrain directive queue
    this.scheduler.schedule("brain:pull", GHOSTBRAIN_PULL_INTERVAL_MS, async () => {
      await this._pullBrainTasks();
    });

    // Recurring orchestration cycle: health sweep
    this.scheduler.schedule("orchestration:cycle", ORCHESTRATOR_INTERVAL_MS, async () => {
      await this._orchestrationCycle();
    });

    this.scheduler.start();
    console.log(
      `[Orchestrator] Started — agents=${this.agents.size}, ` +
      `agents=[${[...this.agents.keys()].join(",")}]`,
    );
    void this._notifyBrain("orchestrator/started", {
      agent_names: [...this.agents.keys()],
      chain_id:    L1_CHAIN_ID,
      gas_token:   "GST",
    });
  }

  stop(): void {
    this.scheduler.stop();
    this.running = false;
    console.log("[Orchestrator] Stopped");
    void this._notifyBrain("orchestrator/stopped", {
      chain_id:  L1_CHAIN_ID,
      gas_token: "GST",
    });
  }

  status(): OrchestratorStatus {
    const now = Math.floor(Date.now() / 1000);
    return {
      running:      this.running,
      agentCount:   this.agents.size,
      queueDepth:   this.taskQueue.length,
      resultCount:  this.resultLog.length,
      successCount: this.successCount,
      errorCount:   this.errorCount,
      uptime_s:     this.startedAt !== null ? now - this.startedAt : 0,
      chain_id:     L1_CHAIN_ID,
      gas_token:    "GST",
    };
  }

  /** Create a properly formed Task with mandatory GhostChain fields. */
  makeTask(
    type:    Task["type"],
    priority: Task["priority"],
    layer:   Task["targetLayer"],
    origin:  string,
    payload: Record<string, unknown>,
  ): Task {
    return {
      id:          this.router.nextId(type),
      type,
      priority,
      targetLayer: layer,
      origin,
      payload,
      createdAt:   Math.floor(Date.now() / 1000),
      chain_id:    L1_CHAIN_ID,
      gas_token:   "GST",
    };
  }

  // ── Internal: dispatch ─────────────────────────────────────────────────────

  private async _drain(): Promise<AgentResult> {
    const task = this.taskQueue.shift();
    if (!task) throw new Error("[Orchestrator] _drain called with empty queue");

    const decision = this.router.route(task);
    if (!decision) {
      const err = `[Orchestrator] No route for task type ${task.type}`;
      console.warn(err);
      const result: AgentResult = {
        taskId:    task.id,
        agentName: "infrastructure_agent", // fallback label
        success:   false,
        output:    { error: err },
        handledAt: Math.floor(Date.now() / 1000),
        chain_id:  L1_CHAIN_ID,
        gas_token: "GST",
      };
      return result;
    }

    const agent = this.agents.get(decision.agentName);
    if (!agent) {
      const err = `[Orchestrator] Agent ${decision.agentName} not registered`;
      console.error(err);
      const result: AgentResult = {
        taskId:    task.id,
        agentName: decision.agentName,
        success:   false,
        output:    { error: err },
        handledAt: Math.floor(Date.now() / 1000),
        chain_id:  L1_CHAIN_ID,
        gas_token: "GST",
      };
      return result;
    }

    let result: AgentResult;
    try {
      result = await agent.handle(task);
      if (result.success) this.successCount += 1;
      else                this.errorCount   += 1;
    } catch (err: unknown) {
      this.errorCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      result = {
        taskId:    task.id,
        agentName: decision.agentName,
        success:   false,
        output:    { error: message },
        handledAt: Math.floor(Date.now() / 1000),
        chain_id:  L1_CHAIN_ID,
        gas_token: "GST",
      };
    }

    this._appendResult(result);
    void this._notifyBrain("orchestrator/task-result", {
      task_id:    result.taskId,
      agent:      result.agentName,
      success:    result.success,
      chain_id:   result.chain_id,
      gas_token:  result.gas_token,
    });
    return result;
  }

  // ── Internal: GhostBrain pull & push ──────────────────────────────────────

  private async _pullBrainTasks(): Promise<void> {
    const url = `${this.ghostbrainUrl}/api/v1/directives?agent=orchestrator`;
    try {
      const res = await this.fetcher(url);
      if (!res.ok) return;
      const data = (await res.json()) as unknown;
      const directives = Array.isArray(data)
        ? (data as GhostBrainTask[])
        : ((data as { directives?: GhostBrainTask[] }).directives ?? []);

      for (const d of directives) {
        if (!d.task?.type) continue;
        const task: Task = {
          id:          d.id ?? this.router.nextId(d.task.type as Task["type"]),
          type:        (d.task.type as Task["type"]) ?? "INFRASTRUCTURE",
          priority:    (d.task.priority as Task["priority"]) ?? "MEDIUM",
          targetLayer: (d.task.targetLayer as Task["targetLayer"]) ?? "L1",
          origin:      "ghostbrain-core",
          payload:     d.task.payload ?? d.payload ?? {},
          createdAt:   Math.floor(Date.now() / 1000),
          chain_id:    L1_CHAIN_ID,
          gas_token:   "GST",
        };
        await this.submit(task);
      }
    } catch {
      // GhostBrain offline — not an error, will retry next tick
    }
  }

  private async _notifyBrain(
    endpoint: string,
    data:     Record<string, unknown>,
  ): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      if (!res.ok)
        console.debug(`[Orchestrator] GhostBrain ${endpoint} returned ${res.status}`);
    } catch {
      // Silence — offline brain degrades gracefully
    }
  }

  // ── Internal: recurring cycle ──────────────────────────────────────────────

  private async _orchestrationCycle(): Promise<void> {
    const healthTasks: Task[] = [];

    // L1 node health
    healthTasks.push(this.makeTask("INFRASTRUCTURE", "MEDIUM", "L1", "orchestrator:cycle", {
      action:   "check_node_health",
      rpc_url:  process.env["L1_RPC_URL"] ?? "http://localhost:18545",
      chain_id: L1_CHAIN_ID,
    }));

    // L2 node health
    healthTasks.push(this.makeTask("INFRASTRUCTURE", "MEDIUM", "L2", "orchestrator:cycle", {
      action:   "check_node_health",
      rpc_url:  process.env["L2_RPC_URL"] ?? "http://localhost:29545",
      chain_id: L2_CHAIN_ID,
    }));

    // L3 node health
    healthTasks.push(this.makeTask("INFRASTRUCTURE", "MEDIUM", "L3", "orchestrator:cycle", {
      action:   "check_node_health",
      rpc_url:  process.env["L3_RPC_URL"] ?? "http://localhost:39545",
      chain_id: L3_CHAIN_ID,
    }));

    // Validator performance sweep
    healthTasks.push(this.makeTask("VALIDATOR", "MEDIUM", "L1", "orchestrator:cycle", {
      action: "sweep_performance",
    }));

    // Economic snapshot
    healthTasks.push(this.makeTask("ECONOMIC", "LOW", "L1", "orchestrator:cycle", {
      action: "snapshot_economics",
    }));

    // Governance proposal monitor
    healthTasks.push(this.makeTask("GOVERNANCE", "LOW", "L1", "orchestrator:cycle", {
      action: "check_proposals",
    }));

    await Promise.allSettled(healthTasks.map((t) => this.submit(t)));
  }

  // ── Internal: result log ───────────────────────────────────────────────────

  private _appendResult(result: AgentResult): void {
    this.resultLog.push(result);
    if (this.resultLog.length > MAX_RESULT_HISTORY)
      this.resultLog.splice(0, this.resultLog.length - MAX_RESULT_HISTORY);
  }
}

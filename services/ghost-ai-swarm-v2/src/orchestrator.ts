/**
 * GhostStack Swarm Orchestrator
 *
 * Coordinates multi-agent workflows:
 *   upgrade-cycle:       Architect → Executor → Auditor → Governor
 *   security-incident:   Security → Fraud → Governor → Infra
 *   economic-rebalance:  Market → Treasury → DEX → Lend
 *   node-repair:         Node → Infra → Network
 */

import { randomUUID }           from "crypto";
import { bus }                  from "./bus/messageBus.js";
import type { WorkflowType, SwarmTask, AgentRole, TaskType } from "./types.js";

// Agent registry — populated by index.ts on startup
import type { BaseAgent } from "./agents/base.js";

export interface WorkflowStep {
  role:    AgentRole;
  type:    TaskType;
  payload: Record<string, unknown>;
}

export interface WorkflowRun {
  id:        string;
  type:      WorkflowType;
  status:    "running" | "completed" | "failed";
  startedAt: string;
  steps:     Array<{ step: WorkflowStep; result: Record<string, unknown>; completedAt: string }>;
  error?:    string;
}

type AgentRegistry = Map<AgentRole, BaseAgent>;

const WORKFLOWS: Record<WorkflowType, WorkflowStep[]> = {
  "upgrade-cycle": [
    { role: "architect", type: "analyze-ecosystem", payload: {} },
    { role: "executor",  type: "generate-code",     payload: {} },
    { role: "auditor",   type: "audit-contract",    payload: {} },
    { role: "governor",  type: "draft-proposal",    payload: {} },
  ],
  "security-incident": [
    { role: "security", type: "monitor-attacks",      payload: {} },
    { role: "fraud",    type: "detect-anomaly",       payload: {} },
    { role: "governor", type: "enforce-constitution", payload: {} },
    { role: "infra",    type: "repair-node",          payload: {} },
  ],
  "economic-rebalance": [
    { role: "market",    type: "detect-arbitrage",  payload: {} },
    { role: "treasury",  type: "allocate-liquidity", payload: {} },
    { role: "dex",       type: "rebalance-pool",    payload: {} },
    { role: "lend",      type: "adjust-rate",       payload: {} },
  ],
  "node-repair": [
    { role: "node",    type: "restart-node",  payload: {} },
    { role: "infra",   type: "repair-node",   payload: {} },
    { role: "network", type: "sync-layers",   payload: {} },
  ],
};

export class SwarmOrchestrator {
  private runs = new Map<string, WorkflowRun>();

  constructor(private registry: AgentRegistry) {}

  async startWorkflow(
    workflowType: WorkflowType,
    initialPayload: Record<string, unknown> = {}
  ): Promise<WorkflowRun> {
    const id  = randomUUID();
    const run: WorkflowRun = {
      id,
      type:      workflowType,
      status:    "running",
      startedAt: new Date().toISOString(),
      steps:     [],
    };
    this.runs.set(id, run);

    bus.publish("workflow:started", "orchestrator", { id, type: workflowType });

    // Execute steps sequentially; pass prior result as next payload
    const steps = WORKFLOWS[workflowType] ?? [];
    let carry: Record<string, unknown> = { ...initialPayload };

    for (const step of steps) {
      const agent = this.registry.get(step.role);

      if (!agent) {
        run.status = "failed";
        run.error  = `Agent not registered: ${step.role}`;
        bus.publish("workflow:step", "orchestrator", { id, failed: true, role: step.role, error: run.error });
        break;
      }

      try {
        const task: SwarmTask = {
          id:         randomUUID(),
          type:       step.type,
          priority:   "normal",
          targetRole: step.role,
          payload:    { ...step.payload, ...carry },
          createdAt:  Date.now(),
          deadline:   Date.now() + 30_000,
        };
        const result = await agent.execute(task);
        carry = { ...carry, ...result.output };

        run.steps.push({ step, result: result.output ?? {}, completedAt: new Date().toISOString() });

        bus.publish("workflow:step", "orchestrator", { id, role: step.role, type: step.type, ok: true });
      } catch (err) {
        run.status = "failed";
        run.error  = String(err instanceof Error ? err.message : err);
        bus.publish("workflow:step", "orchestrator", { id, failed: true, role: step.role, error: run.error });
        break;
      }

      if (run.status === "failed") break;
    }

    if (run.status === "running") run.status = "completed";

    bus.publish(
      run.status === "completed" ? "workflow:complete" : "workflow:step",
      "orchestrator",
      { id, status: run.status, steps: run.steps.length }
    );

    return run;
  }

  getRun(id: string): WorkflowRun | undefined {
    return this.runs.get(id);
  }

  listRuns(): WorkflowRun[] {
    return [...this.runs.values()].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }
}

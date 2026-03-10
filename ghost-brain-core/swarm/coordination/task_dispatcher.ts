/**
 * GhostBrain Swarm AI — Task Dispatcher
 *
 * Agents can enqueue named tasks targeting a specific agent (or all agents).
 * The SwarmController drains the queue at the start of each tick so tasks
 * logged in tick N are processed in tick N+1.
 *
 * Tasks are informational work items — they carry context data but do NOT
 * execute shell commands themselves. The receiving agent decides what to do
 * with the task in its act() call.
 *
 * Design:
 *   - Simple FIFO queue per agent name.
 *   - Max queue depth per agent: TASK_QUEUE_DEPTH (default 50) — oldest
 *     tasks are dropped if the queue overflows (avoids memory growth).
 *   - Broadcast tasks (target = "*") are delivered to all registered agents.
 */

import type { SwarmRole } from "./agent_interface.js";

// ---------------------------------------------------------------------------
// Task types
// ---------------------------------------------------------------------------

export type TaskKind =
  | "inspect_vm"           // InfrastructureAI: re-check a specific VM
  | "inspect_container"    // InfrastructureAI: re-check a specific container
  | "evaluate_security"    // SecurityAI: run a targeted risk evaluation
  | "optimize_route"       // NetworkAI: reconsider routing for an interface
  | "report_treasury"      // TreasuryAI: emit a treasury health snapshot
  | "recompile_kernel"     // CompilerAI: trigger a kernel recompile if idle
  | "architecture_review"  // ArchitectAI: analyse patterns for a specific category
  | "broadcast_status";    // All agents: publish current agent:status

export interface AgentTask {
  id:        number;
  kind:      TaskKind;
  /** Agent name to receive this task, or "*" for all agents. */
  target:    string;
  /** Originating agent name. */
  from:      string;
  payload?:  Record<string, unknown>;
  enqueuedAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TASK_QUEUE_DEPTH = parseInt(process.env["SWARM_TASK_QUEUE_DEPTH"] ?? "50", 10);

// ---------------------------------------------------------------------------
// TaskDispatcher
// ---------------------------------------------------------------------------

export class TaskDispatcher {
  private readonly queues  = new Map<string, AgentTask[]>();
  private idCounter = 0;

  /**
   * Enqueue a task for a specific agent (or "*" to broadcast to all agents).
   * Returns the assigned task ID.
   */
  enqueue(
    kind:    TaskKind,
    target:  string,
    from:    string,
    payload?: Record<string, unknown>,
  ): number {
    const id   = ++this.idCounter;
    const task: AgentTask = { id, kind, target, from, payload, enqueuedAt: Date.now() };

    const queue = this.getOrCreate(target);
    if (queue.length >= TASK_QUEUE_DEPTH) {
      // Drop the oldest task to prevent unbounded growth.
      queue.shift();
    }
    queue.push(task);
    return id;
  }

  /**
   * Drain and return all tasks for a given agent, including broadcast tasks
   * targeting "*".  Called by SwarmController before each agent's act().
   */
  drainFor(agentName: string): AgentTask[] {
    const direct    = this.drainQueue(agentName);
    const broadcast = this.drainQueue("*");
    return [...direct, ...broadcast];
  }

  /** Total number of pending tasks across all queues. */
  get pendingCount(): number {
    let total = 0;
    for (const q of this.queues.values()) total += q.length;
    return total;
  }

  /** Flush all queues — called during graceful shutdown. */
  flush(): void {
    this.queues.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrCreate(key: string): AgentTask[] {
    let q = this.queues.get(key);
    if (!q) {
      q = [];
      this.queues.set(key, q);
    }
    return q;
  }

  private drainQueue(key: string): AgentTask[] {
    const q = this.queues.get(key);
    if (!q || q.length === 0) return [];
    const items = q.splice(0, q.length);
    return items;
  }
}

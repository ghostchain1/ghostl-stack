/**
 * BaseAgent — abstract base class for all GhostStack AI agents.
 *
 * Each agent:
 *   - Has a fixed role, name, description, and capability list
 *   - Publishes lifecycle events to the message bus
 *   - Implements `handleTask()` for its specific task types
 *   - Exposes `status` and `taskCount` for swarm observability
 */

import { randomUUID } from "node:crypto";
import { bus }        from "../bus/messageBus.js";
import type {
  AgentRole, AgentStatus, AgentDescriptor, SwarmTask, TaskResult,
} from "../types.js";

export abstract class BaseAgent {
  abstract readonly role:         AgentRole;
  abstract readonly name:         string;
  abstract readonly description:  string;
  abstract readonly capabilities: string[];

  protected status:    AgentStatus = "online";
  protected taskCount: number      = 0;
  protected lastTaskAt: number     = 0;

  /** Execute a task. Returns a TaskResult. */
  async execute(task: SwarmTask): Promise<TaskResult> {
    const start = Date.now();
    this.status    = "busy";
    this.taskCount++;
    this.lastTaskAt = Date.now();

    bus.publish("task:submitted", this.role, { taskId: task.id, type: task.type });

    let output: Record<string, unknown> = {};
    let success = true;
    let error: string | undefined;

    try {
      output = await this.handleTask(task);
      bus.publish("task:completed", this.role, { taskId: task.id, output });
    } catch (e) {
      success = false;
      error   = e instanceof Error ? e.message : String(e);
      bus.publish("task:failed", this.role, { taskId: task.id, error });
    } finally {
      this.status = "online";
    }

    return {
      taskId:     task.id,
      agentId:    this.role,
      output,
      durationMs: Date.now() - start,
      success,
      error,
    };
  }

  /** Subclasses implement their specific task logic here. */
  protected abstract handleTask(task: SwarmTask): Promise<Record<string, unknown>>;

  /** Universal health check — returns descriptor for swarm registry. */
  getDescriptor(): AgentDescriptor {
    return {
      id:          this.role,
      name:        this.name,
      description: this.description,
      status:      this.status,
      taskCount:   this.taskCount,
      lastTaskAt:  this.lastTaskAt,
      capabilities: this.capabilities,
    };
  }

  /** Announce online presence to the bus. */
  announce(): void {
    bus.publish("agent:online", this.role, { name: this.name });
  }

  /** Generate a new task skeleton (convenience for cross-agent dispatching). */
  protected makeTask(
    type: SwarmTask["type"],
    payload: Record<string, unknown>,
    priority: SwarmTask["priority"] = "normal",
  ): SwarmTask {
    const now = Date.now();
    return {
      id:         randomUUID(),
      type,
      priority,
      payload,
      targetRole: undefined,
      createdAt:  now,
      deadline:   now + 30_000,
    };
  }
}

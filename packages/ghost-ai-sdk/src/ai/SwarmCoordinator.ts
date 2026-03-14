import { randomUUID } from "crypto";
import type { GhostBrainWS } from "./GhostBrainWS.js";
import type { SwarmTask, SwarmHeartbeat, LeaderElection } from "./TaskTypes.js";

export interface SwarmCoordinatorOptions {
  nodeId: string;
  brain:  GhostBrainWS;
  timeoutMs?: number;
}

export class SwarmCoordinator {
  private readonly nodeId: string;
  private readonly brain:  GhostBrainWS;
  private readonly timeoutMs: number;

  constructor(opts: SwarmCoordinatorOptions) {
    this.nodeId    = opts.nodeId;
    this.brain     = opts.brain;
    this.timeoutMs = opts.timeoutMs ?? 4_000;
  }

  async heartbeat(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meta?: Record<string, any>
  ): Promise<void> {
    const hb: SwarmHeartbeat = {
      nodeId:    this.nodeId,
      timestamp: Date.now(),
      meta,
    };
    await this.brain.request("ghost.swarm.heartbeat", hb, { timeoutMs: this.timeoutMs });
  }

  async electLeader(): Promise<LeaderElection> {
    return this.brain.request<LeaderElection>(
      "ghost.swarm.leader.elect",
      { nodeId: this.nodeId, timestamp: Date.now() },
      { timeoutMs: this.timeoutMs }
    );
  }

  async dispatch(task: SwarmTask): Promise<void> {
    const enriched: SwarmTask = {
      ...task,
      taskId:   task.taskId ?? randomUUID(),
      priority: task.priority ?? 3,
    };
    await this.brain.request("ghost.swarm.task.dispatch", enriched, { timeoutMs: this.timeoutMs });
  }
}

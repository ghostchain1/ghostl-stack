/**
 * GhostBrain Swarm AI — Swarm Controller
 *
 * Central coordinator for the GhostBrain Swarm AI system. Runs all agents
 * in parallel each tick, collects their AgentReports, feeds them through the
 * ConsensusEngine, and publishes the resulting action set on the AgentBus.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────┐
 *   │  SwarmController                             │
 *   │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
 *   │  │ArchAI    │  │InfraAI   │  │SecurityAI│   │
 *   │  └──────────┘  └──────────┘  └──────────┘   │
 *   │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
 *   │  │CompilerAI│  │NetworkAI │  │TreasuryAI│   │
 *   │  └──────────┘  └──────────┘  └──────────┘   │
 *   │        │             │             │          │
 *   │        └─────────────┴─────────────┘          │
 *   │                ConsensusEngine                │
 *   │                    AgentBus                   │
 *   └──────────────────────────────────────────────┘
 *
 * - All agents run in parallel (Promise.allSettled) — one slow or failing
 *   agent does not block others.
 * - SIGTERM / SIGINT trigger graceful shutdown (drains writes, calls shutdown
 *   on all agents).
 * - Tick interval: SWARM_INTERVAL_MS (default 10 000 ms).
 */

import { GhostMemoryEngine } from "../../memory/engine/memory_engine.js";
import { AgentBus }          from "../messaging/agent_bus.js";
import { ConsensusEngine }   from "./consensus_engine.js";
import { TaskDispatcher }    from "./task_dispatcher.js";
import type { ISwarmAgent, AgentReport, SwarmContext } from "./agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SWARM_INTERVAL_MS = parseInt(
  process.env["SWARM_INTERVAL_MS"] ?? "10000", 10,
);

// ---------------------------------------------------------------------------
// SwarmController
// ---------------------------------------------------------------------------

export class SwarmController {
  private readonly agents     = new Map<string, ISwarmAgent>();
  private readonly consensus  = new ConsensusEngine();
  private readonly dispatcher = new TaskDispatcher();
  private running  = false;
  private tickCount = 0;

  /** Expose bus so external callers can subscribe to consensus:actions. */
  readonly bus: AgentBus;
  /** Expose memory so the swarm start script can call init(). */
  readonly memory: GhostMemoryEngine;
  /** Expose dispatcher so start_swarm.ts can enqueue seed tasks. */
  readonly tasks: TaskDispatcher;

  constructor(memoryPath?: string) {
    this.bus    = new AgentBus();
    this.memory = new GhostMemoryEngine(memoryPath);
    this.tasks  = this.dispatcher;
  }

  /**
   * Register an agent. Agent names must be unique.
   * Returns `this` for chaining.
   */
  register(agent: ISwarmAgent): this {
    if (this.agents.has(agent.name)) {
      throw new Error(`Duplicate swarm agent: "${agent.name}"`);
    }
    this.agents.set(agent.name, agent);
    return this;
  }

  /**
   * Start the swarm loop. Blocks until stop() is called or a signal arrives.
   */
  async run(): Promise<void> {
    this.running = true;

    const onSignal = () => { void this.stop(); };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT",  onSignal);

    await this.memory.init();
    console.log(
      `[SwarmController] Starting — ${this.agents.size} agent(s), ` +
      `interval=${SWARM_INTERVAL_MS}ms`,
    );

    while (this.running) {
      this.tickCount++;
      await this._runTick();
      await this.sleep(SWARM_INTERVAL_MS);
    }

    console.log("[SwarmController] Swarm loop exited cleanly.");
  }

  /**
   * Graceful shutdown. Calls agent.shutdown() on all agents then flushes
   * memory writes.
   */
  async stop(): Promise<void> {
    this.running = false;
    const shutdowns = Array.from(this.agents.values()).map(async agent => {
      try {
        await agent.shutdown?.();
      } catch (err) {
        console.error(`[SwarmController] shutdown error in "${agent.name}":`, err);
      }
    });
    await Promise.allSettled(shutdowns);
    await this.memory.flush();
    this.bus.removeAll();
    this.dispatcher.flush();
  }

  /** Current tick number. */
  get tick(): number { return this.tickCount; }

  /** Snapshot of the last known agent reports (for /status endpoint). */
  get agentNames(): string[] { return Array.from(this.agents.keys()); }

  // ---------------------------------------------------------------------------
  // Private tick logic
  // ---------------------------------------------------------------------------

  private async _runTick(): Promise<void> {
    const ctx: SwarmContext = {
      memory: this.memory,
      bus:    this.bus,
      tick:   this.tickCount,
    };

    // Run all agents in parallel; never let one failure kill others.
    const settled = await Promise.allSettled(
      Array.from(this.agents.values()).map(async agent => {
        const t0 = Date.now();
        try {
          return await agent.act(ctx);
        } catch (err) {
          // Return a synthetic unhealthy report so consensus excludes it.
          const report: AgentReport = {
            agentName:       agent.name,
            role:            agent.role,
            healthy:         false,
            durationMs:      Date.now() - t0,
            recommendations: [],
            summary:         err instanceof Error ? err.message : String(err),
          };
          console.error(`[SwarmController] Agent "${agent.name}" threw:`, err);
          return report;
        }
      }),
    );

    const reports: AgentReport[] = settled.map(r =>
      r.status === "fulfilled" ? r.value : {
        agentName:       "unknown",
        role:            "infrastructure" as const,
        healthy:         false,
        durationMs:      0,
        recommendations: [],
      },
    );

    // Derive consensus from all agent recommendations.
    const consensus = this.consensus.merge(this.tickCount, reports);

    // Publish on bus so supervisors and external subscribers can consume.
    this.bus.publish("consensus:actions", "swarm_controller", consensus);

    // Persist a summary prediction_alert when high-confidence actions exist.
    const critical = consensus.actions.filter(a => a.confidence >= 0.8);
    if (critical.length > 0) {
      this.memory.record("prediction_alert", "swarm_controller", {
        category:             "prediction_alert",
        confidence:           critical[0]!.confidence,
        occurrencesInWindow:  critical.length,
        windowMs:             SWARM_INTERVAL_MS,
        message:              critical.map(a => a.description).join("; "),
      });
    }

    if (process.env["SWARM_DEBUG"] === "1") {
      console.debug(
        `[SwarmController] tick=${this.tickCount} agents=${reports.length}` +
        ` actions=${consensus.actionCount}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

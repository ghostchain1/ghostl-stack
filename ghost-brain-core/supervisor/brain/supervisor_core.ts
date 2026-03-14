/**
 * GhostBrain Infrastructure Supervisor — Core
 *
 * Central control loop. Collects decisions from the DecisionEngine, executes
 * safe infrastructure actions, and forwards governance alerts to the human-
 * operated signing relay. No autonomous on-chain writes.
 */

import { EventEmitter } from "events";
import { GhostMemoryEngine } from "../../memory/engine/memory_engine.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IController {
  /** Unique name used for error tracking and logging. */
  readonly name: string;
  /** Called every supervisor tick. Must not throw — return a rejected promise instead. */
  check(): Promise<void>;
  /** Optional: graceful cleanup on SIGTERM. */
  shutdown?(): Promise<void>;
}

export interface SupervisorConfig {
  /** Main loop interval in milliseconds. Default: 5 000. */
  intervalMs: number;
  /** Number of consecutive errors before a controller is marked degraded. Default: 3. */
  maxConsecutiveErrors: number;
}

export interface ControllerErrorEvent {
  name: string;
  error: unknown;
  consecutiveErrors: number;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SupervisorConfig = {
  intervalMs: 5_000,
  maxConsecutiveErrors: 3,
};

// ---------------------------------------------------------------------------
// GhostBrainSupervisor
// ---------------------------------------------------------------------------

export class GhostBrainSupervisor extends EventEmitter {
  private readonly controllers = new Map<string, IController>();
  private readonly errorCounts  = new Map<string, number>();
  private readonly config: SupervisorConfig;
  private running = false;
  private tickCount = 0;

  /** Persistent memory — records controller errors, degradations, and lifecycle events. */
  readonly memory: GhostMemoryEngine;

  constructor(config: Partial<SupervisorConfig> = {}, memoryPath?: string) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memory = new GhostMemoryEngine(memoryPath);
  }

  /**
   * Register a controller. Each controller name must be unique.
   * Returns `this` for chaining.
   */
  register(controller: IController): this {
    if (this.controllers.has(controller.name)) {
      throw new Error(`Duplicate controller registration: "${controller.name}"`);
    }
    this.controllers.set(controller.name, controller);
    this.errorCounts.set(controller.name, 0);
    return this;
  }

  /**
   * Start the main supervision loop. Blocks until `stop()` is called or
   * the process receives SIGTERM / SIGINT.
   */
  async run(): Promise<void> {
    this.running = true;

    const onSignal = () => { void this.stop(); };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT",  onSignal);

    // Load historical records from disk before the first tick.
    await this.memory.init();

    console.log(
      `[GhostBrainSupervisor] Starting with ${this.controllers.size} controller(s), ` +
      `interval=${this.config.intervalMs}ms`
    );

    while (this.running) {
      this.tickCount++;
      await this._runTick();
      await this.sleep(this.config.intervalMs);
    }

    console.log("[GhostBrainSupervisor] Loop exited cleanly.");
  }

  /**
   * Graceful shutdown. Calls shutdown() on all registered controllers.
   */
  async stop(): Promise<void> {
    this.running = false;
    for (const [name, ctrl] of this.controllers) {
      try {
        await ctrl.shutdown?.();
      } catch (err) {
        console.error(`[GhostBrainSupervisor] shutdown error in "${name}":`, err);
      }
    }
    // Flush any buffered memory writes before the process exits.
    await this.memory.flush();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _runTick(): Promise<void> {
    for (const [name, ctrl] of this.controllers) {
      try {
        await ctrl.check();
        // Reset consecutive error count on success.
        this.errorCounts.set(name, 0);
      } catch (err) {
        const prev = this.errorCounts.get(name) ?? 0;
        const count = prev + 1;
        this.errorCounts.set(name, count);

        const evt: ControllerErrorEvent = { name, error: err, consecutiveErrors: count };
        this.emit("controller-error", evt);

        // Persist error event to memory for pattern / prediction analysis.
        this.memory.record("repair_failed", name, {
          target: name,
          kind: "controller_error",
          error: err instanceof Error ? err.message : String(err),
        });

        console.error(
          `[GhostBrainSupervisor] Controller "${name}" error #${count}:`, err
        );

        if (count >= this.config.maxConsecutiveErrors) {
          this.emit("controller-degraded", evt);
          // Escalating failure — record a distinct degradation event.
          this.memory.record("repair_failed", name, {
            target: name,
            kind: "controller_degraded",
            error: `Degraded after ${count} consecutive errors`,
          });
          console.warn(
            `[GhostBrainSupervisor] Controller "${name}" degraded after ${count} errors.`
          );
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get tick(): number { return this.tickCount; }
}

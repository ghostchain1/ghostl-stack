/**
 * GhostRuntime — GhostStack service lifecycle manager.
 *
 * Registers and starts all GhostStack services in dependency order.
 * Used by GhostBrain Core and autonomous supervisors to boot the
 * full stack from a single entry point.
 *
 * Usage:
 *   const runtime = new GhostRuntime({ name: "ghoststack-devnet" });
 *   runtime.register(validator);
 *   runtime.register(bridge);
 *   await runtime.start();
 *   await runtime.stop();
 */

// ── Service interface ──────────────────────────────────────────────────────────

/** Minimal interface a service must implement to join the runtime. */
export interface GhostService {
  /** Unique identifier for this service (used in logs and status maps). */
  readonly name: string;

  /** Start the service. Resolves when the service is ready. */
  start(): Promise<void>;

  /** Gracefully stop the service. */
  stop(): Promise<void>;

  /**
   * Optional health probe.  Return true when the service is operating normally.
   * GhostSupervisor calls this during its health-check loop.
   */
  health?(): Promise<boolean>;
}

// ── Runtime configuration ──────────────────────────────────────────────────────

export interface GhostRuntimeConfig {
  /** Human-readable runtime instance identifier (e.g. "ghoststack-devnet"). */
  name?: string;

  /**
   * Milliseconds to wait for each service to start before giving up.
   * Default: 30 000 ms.
   */
  startTimeoutMs?: number;

  /**
   * If true, a start failure in one service does not abort the whole
   * boot sequence — the runtime logs and continues.
   * Default: false.
   */
  continueOnError?: boolean;
}

// ── Status ─────────────────────────────────────────────────────────────────────

export type ServiceStatus = "idle" | "starting" | "running" | "stopped" | "error";

export interface ServiceState {
  name:    string;
  status:  ServiceStatus;
  error?:  string;
  startedAt?: number;
}

// ── GhostRuntime ──────────────────────────────────────────────────────────────

export class GhostRuntime {
  private readonly _name:            string;
  private readonly _startTimeoutMs:  number;
  private readonly _continueOnError: boolean;
  private readonly _services:        GhostService[] = [];
  private readonly _state:           Map<string, ServiceState> = new Map();

  constructor(config: GhostRuntimeConfig = {}) {
    this._name            = config.name            ?? "ghoststack-runtime";
    this._startTimeoutMs  = config.startTimeoutMs  ?? 30_000;
    this._continueOnError = config.continueOnError ?? false;
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  /**
   * Register a service.  Services start in registration order.
   * Registering the same name twice replaces the first entry.
   */
  register(service: GhostService): this {
    const idx = this._services.findIndex(s => s.name === service.name);
    if (idx >= 0) this._services.splice(idx, 1, service);
    else this._services.push(service);

    this._state.set(service.name, { name: service.name, status: "idle" });
    return this;
  }

  /** Deregister a service by name (does not stop it if running). */
  unregister(name: string): boolean {
    const idx = this._services.findIndex(s => s.name === name);
    if (idx < 0) return false;
    this._services.splice(idx, 1);
    this._state.delete(name);
    return true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /** Start all registered services in order. */
  async start(): Promise<void> {
    this._log(`Starting GhostRuntime "${this._name}" with ${this._services.length} service(s) …`);

    for (const svc of this._services) {
      this._setState(svc.name, "starting");
      try {
        await this._withTimeout(svc.start(), svc.name);
        this._setState(svc.name, "running", undefined, Date.now());
        this._log(`[${svc.name}] started`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this._setState(svc.name, "error", msg);
        this._log(`[${svc.name}] start failed: ${msg}`);
        if (!this._continueOnError) {
          throw new Error(`GhostRuntime: service "${svc.name}" failed to start — ${msg}`);
        }
      }
    }

    this._log(`GhostRuntime "${this._name}" running.`);
  }

  /** Stop all running services in reverse registration order. */
  async stop(): Promise<void> {
    this._log(`Stopping GhostRuntime "${this._name}" …`);

    const reversed = [...this._services].reverse();
    for (const svc of reversed) {
      const st = this._state.get(svc.name);
      if (!st || st.status !== "running") continue;
      try {
        await svc.stop();
        this._setState(svc.name, "stopped");
        this._log(`[${svc.name}] stopped`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this._setState(svc.name, "error", msg);
        this._log(`[${svc.name}] stop failed: ${msg}`);
      }
    }

    this._log(`GhostRuntime "${this._name}" stopped.`);
  }

  // ── Status ────────────────────────────────────────────────────────────────────

  /** Snapshot of all service states. */
  status(): ServiceState[] {
    return [...this._state.values()];
  }

  /** Return state for a single named service. */
  serviceStatus(name: string): ServiceState | undefined {
    return this._state.get(name);
  }

  /** True when every registered service is in `running` state. */
  isHealthy(): boolean {
    return this._services.every(s => this._state.get(s.name)?.status === "running");
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private _setState(name: string, status: ServiceStatus, error?: string, startedAt?: number): void {
    const existing = this._state.get(name) ?? { name, status };
    this._state.set(name, { ...existing, status, error, startedAt: startedAt ?? existing.startedAt });
  }

  private _withTimeout<T>(promise: Promise<T>, serviceName: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`service "${serviceName}" start timed out after ${this._startTimeoutMs} ms`)),
        this._startTimeoutMs,
      );
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e);  },
      );
    });
  }

  private _log(msg: string): void {
    // Structured log so GhostBrain can parse it.
    console.log(JSON.stringify({ ts: new Date().toISOString(), runtime: this._name, msg }));
  }
}

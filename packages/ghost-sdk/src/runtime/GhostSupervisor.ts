/**
 * GhostSupervisor — self-healing service watchdog.
 *
 * Periodically calls `health()` on every registered GhostService.
 * When a service reports unhealthy it is stopped then restarted,
 * subject to a per-service cooldown and a circuit-breaker that opens
 * after too many consecutive failures.
 *
 * Usage:
 *   const supervisor = new GhostSupervisor([validator, bridge]);
 *   supervisor.start();          // begins health-check loop
 *   await supervisor.check();    // one-shot manual check
 *   supervisor.stop();           // stops the loop
 */

import type { GhostService } from "./GhostRuntime.js";

// ── Configuration ──────────────────────────────────────────────────────────────

export interface GhostSupervisorConfig {
  /**
   * How often to run the health-check loop.  Default: 30 000 ms.
   */
  intervalMs?: number;

  /**
   * Seconds a service must remain stopped before a restart attempt.
   * Default: 120 s (matches AGENTS.md per-VM cooldown rule).
   */
  cooldownMs?: number;

  /**
   * Maximum consecutive restart attempts before the circuit opens.
   * Default: 4 (matches AGENTS.md circuit-breaker rule of 4/hour).
   */
  maxRestarts?: number;
}

// ── Per-service bookkeeping ───────────────────────────────────────────────────

interface ServiceRecord {
  service:      GhostService;
  restarts:     number;
  lastRestartAt: number;
  circuitOpen:  boolean;
}

// ── ServiceHealthReport ───────────────────────────────────────────────────────

export interface ServiceHealthReport {
  name:        string;
  healthy:     boolean;
  restarts:    number;
  circuitOpen: boolean;
  error?:      string;
}

// ── GhostSupervisor ───────────────────────────────────────────────────────────

export class GhostSupervisor {
  private readonly _intervalMs:  number;
  private readonly _cooldownMs:  number;
  private readonly _maxRestarts: number;
  private readonly _records:     Map<string, ServiceRecord>;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(services: GhostService[], config: GhostSupervisorConfig = {}) {
    this._intervalMs  = config.intervalMs  ?? 30_000;
    this._cooldownMs  = config.cooldownMs  ?? 120_000;
    this._maxRestarts = config.maxRestarts ?? 4;

    this._records = new Map(
      services.map(svc => [svc.name, { service: svc, restarts: 0, lastRestartAt: 0, circuitOpen: false }])
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /** Begin continuous health-check loop. */
  start(): this {
    this.stop();
    this._timer = setInterval(() => void this.check(), this._intervalMs);
    if (typeof (this._timer as NodeJS.Timeout).unref === "function") {
      (this._timer as NodeJS.Timeout).unref();
    }
    return this;
  }

  /** Stop the health-check loop. */
  stop(): this {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  // ── One-shot check ────────────────────────────────────────────────────────────

  /**
   * Run one health-check cycle across all registered services.
   * Returns a report for each service.
   */
  async check(): Promise<ServiceHealthReport[]> {
    const reports: ServiceHealthReport[] = [];

    for (const [name, record] of this._records) {
      const report = await this._checkOne(record);
      reports.push({ name, ...report });
    }

    return reports;
  }

  // ── Registration ──────────────────────────────────────────────────────────────

  /** Add a service to the supervisor after construction. */
  add(service: GhostService): this {
    this._records.set(service.name, {
      service,
      restarts:     0,
      lastRestartAt: 0,
      circuitOpen:  false,
    });
    return this;
  }

  /** Remove a service from supervision. */
  remove(name: string): boolean {
    return this._records.delete(name);
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async _checkOne(rec: ServiceRecord): Promise<Omit<ServiceHealthReport, "name">> {
    const { service } = rec;

    // Services without a health() method are assumed healthy.
    if (!service.health) {
      return { healthy: true, restarts: rec.restarts, circuitOpen: rec.circuitOpen };
    }

    let healthy = false;
    let error: string | undefined;

    try {
      healthy = await service.health();
    } catch (err) {
      error   = err instanceof Error ? err.message : String(err);
      healthy = false;
    }

    if (healthy) {
      // Reset consecutive-failure counter on recovery.
      rec.restarts = 0;
      rec.circuitOpen = false;
      return { healthy: true, restarts: 0, circuitOpen: false };
    }

    // Unhealthy — attempt restart if circuit is closed and cooldown elapsed.
    if (rec.circuitOpen) {
      return { healthy: false, restarts: rec.restarts, circuitOpen: true, error: "circuit open" };
    }

    const now = Date.now();
    const cooldownOk = (now - rec.lastRestartAt) >= this._cooldownMs;
    if (!cooldownOk) {
      return { healthy: false, restarts: rec.restarts, circuitOpen: false, error: "cooldown active" };
    }

    // Attempt restart.
    this._log(`[${service.name}] unhealthy — restarting (attempt ${rec.restarts + 1}/${this._maxRestarts})`);
    try {
      await service.stop().catch(() => { /* best-effort */ });
      await service.start();
      rec.restarts      += 1;
      rec.lastRestartAt  = Date.now();

      if (rec.restarts >= this._maxRestarts) {
        rec.circuitOpen = true;
        this._log(`[${service.name}] circuit breaker OPEN after ${rec.restarts} restarts`);
      }

      return { healthy: true, restarts: rec.restarts, circuitOpen: rec.circuitOpen };
    } catch (restartErr) {
      const msg = restartErr instanceof Error ? restartErr.message : String(restartErr);
      rec.restarts      += 1;
      rec.lastRestartAt  = Date.now();

      if (rec.restarts >= this._maxRestarts) {
        rec.circuitOpen = true;
        this._log(`[${service.name}] circuit breaker OPEN after ${rec.restarts} restarts`);
      }

      return { healthy: false, restarts: rec.restarts, circuitOpen: rec.circuitOpen, error: msg };
    }
  }

  private _log(msg: string): void {
    console.log(JSON.stringify({ ts: new Date().toISOString(), supervisor: "GhostSupervisor", msg }));
  }
}

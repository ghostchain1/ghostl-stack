/**
 * GhostStack Global AI Orchestrator — Task Scheduler
 *
 * Drift-corrected interval scheduler for recurring orchestrator cycles.
 *
 * Design:
 *   - Each task has a name, interval (ms), and async handler.
 *   - start() activates all registered timers; stop() clears them without
 *     removing registrations so start() can resume the same schedule.
 *   - setEnabled(id, false) suppresses a task's handler without cancelling
 *     the timer — useful for temporarily pausing a cycle.
 *   - MAX_SCHEDULED_TASKS prevents unbounded registration.
 *
 * Typical orchestrator cycles:
 *   - Infrastructure health poll   30 s
 *   - Validator performance sweep  60 s
 *   - Economic optimisation pass  120 s
 *   - Governance proposal monitor 180 s
 *   - System telemetry snapshot    30 s
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SCHEDULED_TASKS = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScheduledTask {
  id:         string;
  name:       string;
  intervalMs: number;
  handler:    () => Promise<void>;
  enabled:    boolean;
  lastRunAt:  number | null;  // Unix seconds
  runCount:   number;
  errorCount: number;
}

export interface SchedulerStatus {
  running:   boolean;
  taskCount: number;
  tasks:     Array<{
    id:         string;
    name:       string;
    intervalMs: number;
    enabled:    boolean;
    lastRunAt:  number | null;
    runCount:   number;
    errorCount: number;
  }>;
}

// ── TaskScheduler ─────────────────────────────────────────────────────────────

export class TaskScheduler {
  private readonly tasks  = new Map<string, ScheduledTask>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private running         = false;
  private idSeq           = 0;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a recurring task.
   * @returns Opaque task id — pass to cancel() or setEnabled().
   */
  schedule(name: string, intervalMs: number, handler: () => Promise<void>): string {
    if (this.tasks.size >= MAX_SCHEDULED_TASKS)
      throw new Error(`[TaskScheduler] Limit of ${MAX_SCHEDULED_TASKS} tasks reached`);

    const id = `sched-${++this.idSeq}-${Date.now()}`;
    const task: ScheduledTask = {
      id,
      name,
      intervalMs,
      handler,
      enabled:   true,
      lastRunAt: null,
      runCount:  0,
      errorCount: 0,
    };

    this.tasks.set(id, task);
    if (this.running) this._startTimer(task);
    return id;
  }

  /** Remove a task entirely. Returns true if the task existed. */
  cancel(id: string): boolean {
    this._clearTimer(id);
    return this.tasks.delete(id);
  }

  /** Pause or resume a task without removing it. */
  setEnabled(id: string, enabled: boolean): void {
    const task = this.tasks.get(id);
    if (task) task.enabled = enabled;
  }

  /** Start all registered timers. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    for (const task of this.tasks.values()) this._startTimer(task);
    console.log(`[TaskScheduler] Started — ${this.tasks.size} task(s) active`);
  }

  /** Clear all timers without removing task registrations. Idempotent. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const id of this.timers.keys()) this._clearTimer(id);
    console.log("[TaskScheduler] Stopped");
  }

  /** Snapshot of scheduler state. */
  status(): SchedulerStatus {
    return {
      running:   this.running,
      taskCount: this.tasks.size,
      tasks:     [...this.tasks.values()].map((t) => ({
        id:         t.id,
        name:       t.name,
        intervalMs: t.intervalMs,
        enabled:    t.enabled,
        lastRunAt:  t.lastRunAt,
        runCount:   t.runCount,
        errorCount: t.errorCount,
      })),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _startTimer(task: ScheduledTask): void {
    const timer = setInterval(async () => {
      if (!task.enabled) return;
      try {
        await task.handler();
        task.runCount  += 1;
        task.lastRunAt  = Math.floor(Date.now() / 1000);
      } catch (err: unknown) {
        task.errorCount += 1;
        if (err instanceof Error)
          console.error(`[TaskScheduler] "${task.name}" failed:`, err.message);
      }
    }, task.intervalMs);

    this.timers.set(task.id, timer);
  }

  private _clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }
}

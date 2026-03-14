/**
 * GhostBrain — Resource Scheduler
 *
 * Priority queue for infrastructure work items. The kernel brain
 * enqueues jobs (scale, restart, rebalance, learn), and the scheduler
 * dispatches them with rate limiting and back-pressure management.
 *
 * Priority levels (higher = processed first):
 *   EMERGENCY (100) — crash imminent, act immediately
 *   HIGH (75)       — threshold critical breach
 *   MEDIUM (50)     — threshold warning breach or rebalance
 *   LOW (25)        — learn, optimize, background
 *   IDLE (0)        — deferred analytics
 */

export type JobPriority = 0 | 25 | 50 | 75 | 100;
export const Priority = { EMERGENCY: 100, HIGH: 75, MEDIUM: 50, LOW: 25, IDLE: 0 } as const;

export type JobType =
  | "throttle"
  | "scale_memory"
  | "restart"
  | "migrate"
  | "rebalance"
  | "alert"
  | "learn"
  | "collect";

export interface Job {
  id:          string;
  type:        JobType;
  priority:    JobPriority;
  resourceId:  string;
  payload:     Record<string, unknown>;
  enqueuedAt:  number;
  attempts:    number;
  maxAttempts: number;
}

export type JobHandler = (job: Job) => Promise<boolean>;  // returns true = success

// ── Internal queue ────────────────────────────────────────────────────────────

let _seq = 0;
const _queue: Job[] = [];
const _handlers = new Map<JobType, JobHandler>();
let _running  = false;
let _interval: ReturnType<typeof setInterval> | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/** Register a handler for a job type. */
export function registerHandler(type: JobType, handler: JobHandler): void {
  _handlers.set(type, handler);
}

/** Enqueue a new job. Returns job id. */
export function enqueue(
  type: JobType,
  resourceId: string,
  priority: JobPriority,
  payload: Record<string, unknown> = {},
  maxAttempts = 3,
): string {
  const id = `job-${Date.now()}-${++_seq}`;
  const job: Job = { id, type, priority, resourceId, payload, enqueuedAt: Date.now(), attempts: 0, maxAttempts };
  // Insert sorted by priority desc, then by enqueuedAt asc
  let insertAt = _queue.length;
  for (let i = 0; i < _queue.length; i++) {
    if (_queue[i]!.priority < priority) { insertAt = i; break; }
  }
  _queue.splice(insertAt, 0, job);
  return id;
}

/** Cancel a pending job by id. */
export function cancelJob(id: string): boolean {
  const idx = _queue.findIndex(j => j.id === id);
  if (idx < 0) return false;
  _queue.splice(idx, 1);
  return true;
}

/** Dequeue and attempt the next job. */
async function processNext(): Promise<void> {
  if (_running) return;
  const job = _queue.shift();
  if (!job) return;

  const handler = _handlers.get(job.type);
  if (!handler) return; // no handler — discard

  _running = true;
  job.attempts++;
  try {
    const ok = await handler(job);
    if (!ok && job.attempts < job.maxAttempts) {
      // Re-enqueue at lower priority after failure
      job.priority = (Math.max(0, job.priority - 25) as JobPriority);
      _queue.push(job);
    }
  } catch {
    // swallow handler errors — don't crash the scheduler
  } finally {
    _running = false;
  }
}

/** Start the scheduler dispatch loop. */
export function startScheduler(intervalMs = 500): void {
  if (_interval) return;
  _interval = setInterval(() => { void processNext(); }, intervalMs);
}

/** Stop the scheduler. */
export function stopScheduler(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

/** Stats for observability. */
export function schedulerStats(): {
  queueDepth: number;
  handlerCount: number;
  byPriority: Record<string, number>;
} {
  const byPriority: Record<string, number> = {};
  for (const j of _queue) {
    const k = String(j.priority);
    byPriority[k] = (byPriority[k] ?? 0) + 1;
  }
  return { queueDepth: _queue.length, handlerCount: _handlers.size, byPriority };
}

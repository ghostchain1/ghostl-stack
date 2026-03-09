/**
 * Recovery Policy
 *
 * Rules:
 *   - Restart crashed/stopped VMs that are in the managed allowlist.
 *   - Restart unhealthy/stopped containers with ghost-prefixed images.
 *   - Propose node restart when sync lag exceeds threshold.
 *   - Backoff: suppress further restarts if MAX_RESTART_ATTEMPTS exceeded within a window.
 *
 * All VM-stop and node-restart actions require human ratification.
 * Container restart and VM-start are auto-executable when ALLOW_AUTO_EXEC=true.
 */

/** Number of consecutive restart actions needed before the target is flagged as
 *  critically degraded and suppressed from further auto-exec until human review. */
export const CRITICAL_FAIL_THRESHOLD = 5;

/** Window (in cycles) over which restart counts are tracked per target. */
export const RESTART_WINDOW_CYCLES = 10;

/** VM states that trigger an automatic start action. */
export const VM_RECOVERABLE_STATES: ReadonlySet<string> = new Set([
  "stopped",
  "crashed",
]);

/** Container health values that trigger a restart action. */
export const CONTAINER_RECOVERABLE_HEALTH: ReadonlySet<string> = new Set([
  "unhealthy",
]);

/** Container statuses (non-health) that trigger restart when health is "none". */
export const CONTAINER_DEAD_STATUSES: ReadonlySet<string> = new Set([
  "exited",
  "dead",
  "created",
]);

// ---------------------------------------------------------------------------
// Per-target restart tracking (in-memory, resets on service restart)
// ---------------------------------------------------------------------------

interface RestartRecord {
  count:     number;
  lastCycle: number;
}

const restartTracker = new Map<string, RestartRecord>();
let currentCycle = 0;

export function advanceCycle(): void {
  currentCycle++;
  // Prune stale records
  for (const [k, r] of restartTracker) {
    if (currentCycle - r.lastCycle > RESTART_WINDOW_CYCLES) {
      restartTracker.delete(k);
    }
  }
}

export function recordRestart(target: string): void {
  const r = restartTracker.get(target) ?? { count: 0, lastCycle: currentCycle };
  restartTracker.set(target, { count: r.count + 1, lastCycle: currentCycle });
}

/** True when a target has exceeded the critical fail threshold and should
 *  be suppressed from auto-exec until a human clears the record. */
export function isCriticallyDegraded(target: string): boolean {
  return (restartTracker.get(target)?.count ?? 0) >= CRITICAL_FAIL_THRESHOLD;
}

export function getRestartCount(target: string): number {
  return restartTracker.get(target)?.count ?? 0;
}

export function clearRestartRecord(target: string): void {
  restartTracker.delete(target);
}

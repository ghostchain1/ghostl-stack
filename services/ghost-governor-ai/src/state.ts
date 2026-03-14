/**
 * Module-level governor state store — single source of truth for status routes.
 */
import type { GovernorCycle, GovernorStatus } from "./types.js";

const startTime = Date.now();

let _running        = false;
let _cycleCount     = 0;
let _lastCycle: GovernorCycle | undefined;
let _totalProposals = 0;

/** GOVERNOR_DRY_RUN defaults to true — safe-by-default. Set to "false" to submit proposals to the governance bridge. */
export const DRY_RUN = process.env.GOVERNOR_DRY_RUN !== "false";

/** ALLOW_EMERGENCY_EXEC=true enables auto-execution of emergency_pause proposals only. */
export const ALLOW_EMERGENCY_EXEC = process.env.ALLOW_EMERGENCY_EXEC === "true";

export function setRunning(running: boolean): void {
  _running = running;
}

export function recordCycle(cycle: GovernorCycle): void {
  _cycleCount++;
  _lastCycle       = cycle;
  _totalProposals += cycle.proposals.length;
}

export function getStatus(): GovernorStatus {
  return {
    running:        _running,
    cycleCount:     _cycleCount,
    lastCycle:      _lastCycle,
    totalProposals: _totalProposals,
    dryRun:         DRY_RUN,
    uptimeSeconds:  Math.floor((Date.now() - startTime) / 1000),
  };
}

import type { MultichainCycle, MultichainStatus } from "./types.js";

/**
 * MULTICHAIN_DRY_RUN (default: true)
 *   When true, no auto-execution occurs and all actions are proposals only.
 *   Set to "false" to allow auto-execution of eligible actions.
 *
 * MULTICHAIN_ALLOW_AUTO_EXEC (default: false)
 *   When true (AND DRY_RUN=false), oracle_update actions may auto-execute.
 *   All fund-moving or external-chain actions always require ratification.
 */
export const DRY_RUN        = process.env["MULTICHAIN_DRY_RUN"] !== "false";
export const ALLOW_AUTO_EXEC = !DRY_RUN && process.env["MULTICHAIN_ALLOW_AUTO_EXEC"] === "true";

let   _running      = false;
let   _cycleCount   = 0;
let   _totalActions = 0;
let   _lastCycle:   MultichainCycle | undefined;
const _startTime    = Date.now();

export function setRunning(v: boolean): void { _running = v; }

export function recordCycle(cycle: MultichainCycle): void {
  _cycleCount++;
  _lastCycle      = cycle;
  _totalActions  += cycle.actions.length;
}

export function getStatus(): MultichainStatus {
  return {
    running:       _running,
    cycleCount:    _cycleCount,
    lastCycle:     _lastCycle,
    totalActions:  _totalActions,
    autoExec:      ALLOW_AUTO_EXEC,
    dryRun:        DRY_RUN,
    uptimeSeconds: Math.floor((Date.now() - _startTime) / 1_000),
  };
}

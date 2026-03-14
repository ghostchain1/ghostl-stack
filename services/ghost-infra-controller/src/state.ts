/**
 * Module-level controller state store.
 */
import type { ControllerCycle, ControllerStatus } from "./types.js";

const startTime = Date.now();

let _running      = false;
let _cycleCount   = 0;
let _lastCycle: ControllerCycle | undefined;
let _totalActions = 0;

/**
 * INFRA_CONTROLLER_DRY_RUN defaults to true.
 * When false, auto-executable actions (container restart, VM start) are executed
 * directly by the controller without waiting for human ratification.
 */
export const DRY_RUN = process.env.INFRA_CONTROLLER_DRY_RUN !== "false";

/**
 * ALLOW_AUTO_EXEC=true permits the controller to automatically execute
 * low/medium-risk recovery actions (container restart, VM start, DNS reload).
 * High/critical-risk actions always require human ratification regardless.
 *
 * Only honoured when DRY_RUN=false.
 */
export const ALLOW_AUTO_EXEC = !DRY_RUN && process.env.ALLOW_AUTO_EXEC === "true";

export function setRunning(running: boolean): void {
  _running = running;
}

export function recordCycle(cycle: ControllerCycle): void {
  _cycleCount++;
  _lastCycle     = cycle;
  _totalActions += cycle.actions.length;
}

export function getStatus(): ControllerStatus {
  return {
    running:       _running,
    cycleCount:    _cycleCount,
    lastCycle:     _lastCycle,
    totalActions:  _totalActions,
    autoExec:      ALLOW_AUTO_EXEC,
    dryRun:        DRY_RUN,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  };
}

/**
 * Code Repair Task — emits build-code into the swarm bus.
 * Use sparingly: actual code writes require DRY_RUN=0 set explicitly in the environment.
 */
import { swarmBus } from "../communication/swarm-bus";
import { SWARM_EVENTS_TOTAL } from "../metrics";
import type { BuildTask } from "../types";

export function repairCode(target = "ghostchain", dryRun?: boolean): void {
  const task: BuildTask = { target, dryRun };
  SWARM_EVENTS_TOTAL.inc({ event: "build-code" });
  swarmBus.emit("build-code", task);
}

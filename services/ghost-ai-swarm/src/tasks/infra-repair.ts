/**
 * Infrastructure Repair Task — emits infra-repair into the swarm bus.
 * The infra-agent delegates the actual repair call to GACK (which enforces its own DRY_RUN).
 */
import { swarmBus } from "../communication/swarm-bus";
import { SWARM_EVENTS_TOTAL } from "../metrics";
import type { InfraRepairTask } from "../types";

export function repairInfrastructure(opts: Partial<InfraRepairTask> = {}): void {
  const task: InfraRepairTask = { ...opts };
  SWARM_EVENTS_TOTAL.inc({ event: "infra-repair" });
  swarmBus.emit("infra-repair", task);
}

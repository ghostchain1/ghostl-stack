/**
 * Docker Manager
 *
 * Evaluates the container list from SystemState and generates restart actions
 * for unhealthy or exited ghost-prefixed containers.
 *
 * SECURITY:
 *   - All containers checked against isAllowedImage() + isAllowedContainer().
 *   - execFile with a fixed argument list — no shell interpolation.
 *   - Container stop actions always require human ratification.
 *   - Container restart is auto-executable when ALLOW_AUTO_EXEC=true and the
 *     container is not critically degraded.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { SystemState, InfraAction, ContainerInfo } from "../types.js";
import { assertSafeName }         from "../types.js";
import { isAllowedImage, isAllowedContainer } from "../policies/security-policy.js";
import {
  CONTAINER_RECOVERABLE_HEALTH,
  CONTAINER_DEAD_STATUSES,
  recordRestart,
  isCriticallyDegraded,
  getRestartCount,
} from "../policies/recovery-policy.js";
import { ALLOW_AUTO_EXEC } from "../state.js";

const execFile = promisify(execFileCb);

function needsRestart(c: ContainerInfo): boolean {
  if (!isAllowedImage(c.image)) return false;
  if (!isAllowedContainer(c.name)) return false;
  if (CONTAINER_RECOVERABLE_HEALTH.has(c.health)) return true;
  if (!c.running && CONTAINER_DEAD_STATUSES.has(c.status.split(" ")[0]?.toLowerCase() ?? "")) return true;
  return false;
}

async function dockerRestart(containerName: string): Promise<{ ok: boolean; error?: string }> {
  assertSafeName(containerName, "container");
  try {
    await execFile("docker", ["restart", containerName], { timeout: 60_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function manageContainers(state: SystemState): Promise<InfraAction[]> {
  const actions: InfraAction[] = [];
  const now = Date.now();

  for (const c of state.containers) {
    if (!needsRestart(c)) continue;

    const degraded     = isCriticallyDegraded(c.name);
    const restartCount = getRestartCount(c.name);

    const action: InfraAction = {
      id:          crypto.randomUUID(),
      type:        "container_restart",
      target:      c.name,
      description: `Container "${c.name}" (${c.image}) health="${c.health}" running=${c.running} restarts=${c.restartCount}. ${degraded ? `Critically degraded (${restartCount} controller restarts) — requires human review.` : "Proposing restart."}`,
      params: {
        containerName:   c.name,
        image:           c.image,
        health:          c.health,
        running:         c.running,
        dockerRestarts:  c.restartCount,
        controllerRestarts: restartCount,
        degraded,
      },
      timestamp:   now,
      risk:        degraded ? "critical" : "low",
      autoExecute: !degraded && ALLOW_AUTO_EXEC,
    };

    actions.push(action);

    if (action.autoExecute) {
      recordRestart(c.name);
      const result = await dockerRestart(c.name);
      if (!result.ok) {
        action.params["execError"] = result.error;
        recordRestart(c.name);
      }
      action.params["executed"] = result.ok;
    }
  }

  return actions;
}

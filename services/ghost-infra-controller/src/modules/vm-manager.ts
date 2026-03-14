/**
 * VM Manager
 *
 * Evaluates the VM list from SystemState and generates start/restart actions
 * for stopped or crashed VM domains.
 *
 * SECURITY:
 *   - Only VMs passing isAllowedVM() (name allowlist + safe-name regex) are touched.
 *   - All virsh calls use execFile with a fixed argument array — no shell or interpolation.
 *   - VM-stop actions always require human ratification (autoExecute=false).
 *   - VM-start actions are auto-executable when ALLOW_AUTO_EXEC=true and the VM
 *     is not critically degraded (too many restart attempts).
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify }              from "node:util";
import type { SystemState, InfraAction } from "../types.js";
import { assertSafeName }         from "../types.js";
import { isAllowedVM }            from "../policies/security-policy.js";
import {
  VM_RECOVERABLE_STATES,
  recordRestart,
  isCriticallyDegraded,
  getRestartCount,
} from "../policies/recovery-policy.js";
import { ALLOW_AUTO_EXEC }        from "../state.js";

const execFile = promisify(execFileCb);

async function virshStart(vmName: string): Promise<{ ok: boolean; error?: string }> {
  // Security: name already validated by isAllowedVM before calling this
  assertSafeName(vmName, "VM");
  try {
    await execFile("virsh", ["start", vmName], { timeout: 30_000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function manageVMs(state: SystemState): Promise<InfraAction[]> {
  const actions: InfraAction[] = [];
  const now = Date.now();

  for (const vm of state.vms) {
    if (!isAllowedVM(vm.name)) continue;
    if (!VM_RECOVERABLE_STATES.has(vm.state)) continue;

    const degraded     = isCriticallyDegraded(vm.name);
    const restartCount = getRestartCount(vm.name);

    const action: InfraAction = {
      id:          crypto.randomUUID(),
      type:        "vm_start",
      target:      vm.name,
      description: `VM "${vm.name}" is ${vm.state}. ${degraded ? `Critically degraded (${restartCount} restarts) — requires human review.` : "Proposing start."}`,
      params: {
        vmName:      vm.name,
        currentState: vm.state,
        restartCount,
        degraded,
      },
      timestamp:   now,
      risk:        degraded ? "critical" : "medium",
      autoExecute: !degraded && ALLOW_AUTO_EXEC,
    };

    actions.push(action);

    // Auto-execute if permitted
    if (action.autoExecute) {
      recordRestart(vm.name);
      const result = await virshStart(vm.name);
      if (!result.ok) {
        action.params["execError"] = result.error;
        recordRestart(vm.name); // count the failure again for degraded threshold
      }
      action.params["executed"] = result.ok;
    }
  }

  return actions;
}

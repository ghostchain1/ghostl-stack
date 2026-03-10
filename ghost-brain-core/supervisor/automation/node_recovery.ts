/**
 * Node Recovery
 *
 * Staged recovery process for offline / crashed VM nodes.
 *
 * Stage 1 — Restart: issue `virsh start`
 * Stage 2 — Wait & verify: poll VM state for up to 60 s
 * Stage 3 — Escalate: if still offline, submit governance alert via signing relay
 *
 * Governance escalation is informational — human quorum required for any
 * subsequent action.
 */

import type { VMController }          from "../infrastructure/vm_controller.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryStage = "restart" | "verify" | "escalate" | "recovered" | "failed";

export interface RecoveryResult {
  vmName:      string;
  stage:       RecoveryStage;
  success:     boolean;
  attemptsUsed: number;
  durationMs:  number;
  error?:      string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VERIFY_POLL_INTERVAL_MS = Number(process.env["RECOVERY_POLL_MS"]       ?? "5_000");
const VERIFY_TIMEOUT_MS       = Number(process.env["RECOVERY_TIMEOUT_MS"]    ?? "60_000");
const MAX_RESTART_ATTEMPTS    = Number(process.env["RECOVERY_MAX_ATTEMPTS"]  ?? "3");

const SIGNING_RELAY_URL =
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910";

// ---------------------------------------------------------------------------
// NodeRecovery
// ---------------------------------------------------------------------------

export class NodeRecovery {
  private readonly vms: VMController;

  /** Track restart attempt counts to avoid infinite loops. */
  private readonly attempts = new Map<string, number>();

  constructor(vms: VMController) {
    this.vms = vms;
  }

  /**
   * Attempt staged recovery for a single offline VM.
   * Returns when VM is running or all recovery stages exhausted.
   */
  async recover(vmName: string): Promise<RecoveryResult> {
    const start = Date.now();
    const previousAttempts = this.attempts.get(vmName) ?? 0;

    if (previousAttempts >= MAX_RESTART_ATTEMPTS) {
      console.error(`[NodeRecovery] "${vmName}" exceeded max restart attempts — escalating.`);
      await this.escalate(vmName, `Exceeded ${MAX_RESTART_ATTEMPTS} restart attempts`);
      return {
        vmName,
        stage:        "escalate",
        success:      false,
        attemptsUsed: previousAttempts,
        durationMs:   Date.now() - start,
        error:        "max restart attempts exceeded",
      };
    }

    // Stage 1 — Restart.
    try {
      console.log(`[NodeRecovery] Stage 1: starting VM "${vmName}" (attempt ${previousAttempts + 1})`);
      await this.vms.startVm(vmName);
      this.attempts.set(vmName, previousAttempts + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NodeRecovery] Start command failed for "${vmName}":`, msg);
      return {
        vmName,
        stage:        "restart",
        success:      false,
        attemptsUsed: previousAttempts + 1,
        durationMs:   Date.now() - start,
        error:        msg,
      };
    }

    // Stage 2 — Verify (poll until running or timeout).
    console.log(`[NodeRecovery] Stage 2: verifying "${vmName}" comes online…`);
    const verifyStart = Date.now();
    while (Date.now() - verifyStart < VERIFY_TIMEOUT_MS) {
      await this.sleep(VERIFY_POLL_INTERVAL_MS);
      try {
        const vms    = await this.vms.listVMs();
        const target = vms.find(v => v.name === vmName);
        if (target?.state === "running") {
          console.log(`[NodeRecovery] VM "${vmName}" recovered successfully.`);
          this.attempts.delete(vmName); // Reset on success.
          return {
            vmName,
            stage:        "recovered",
            success:      true,
            attemptsUsed: previousAttempts + 1,
            durationMs:   Date.now() - start,
          };
        }
      } catch {
        // virsh poll error — continue waiting.
      }
    }

    // Stage 3 — Escalate (timeout exceeded).
    console.error(`[NodeRecovery] VM "${vmName}" did not come online within ${VERIFY_TIMEOUT_MS}ms — escalating.`);
    await this.escalate(vmName, `VM did not recover within ${VERIFY_TIMEOUT_MS}ms`);

    return {
      vmName,
      stage:        "escalate",
      success:      false,
      attemptsUsed: previousAttempts + 1,
      durationMs:   Date.now() - start,
      error:        "recovery timeout",
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Post an unsigned governance alert to the human-operated signing relay.
   * Never executes on-chain autonomously.
   */
  private async escalate(vmName: string, reason: string): Promise<void> {
    const payload = {
      type:        "vm_recovery_escalation",
      vm:          vmName,
      reason,
      timestamp:   Date.now(),
      chain_id:    14000101,
      gas_token:   "GST",
      // Signed by human operator at relay — not by GhostBrain.
      from:        "ghostbrain-supervisor",
    };

    try {
      const res = await fetch(`${SIGNING_RELAY_URL}/relay/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`[NodeRecovery] Signing relay returned ${res.status} for escalation.`);
      } else {
        console.log(`[NodeRecovery] Escalation forwarded to signing relay for "${vmName}".`);
      }
    } catch (err) {
      console.error("[NodeRecovery] Failed to reach signing relay:", err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

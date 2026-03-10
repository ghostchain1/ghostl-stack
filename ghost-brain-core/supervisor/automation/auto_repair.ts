/**
 * Auto Repair
 *
 * Dispatches repair actions based on decisions from the DecisionEngine.
 * Each action is attempted with a configurable timeout; failures are logged
 * but do not crash the supervisor loop.
 *
 * Governance decisions (scale_up, governance_alert) are NEVER executed
 * autonomously — they are forwarded to the ProposalExecutor for human review.
 */

import type { Decision, DecisionKind } from "../brain/decision_engine.js";
import type { DockerController }       from "../infrastructure/docker_controller.js";
import type { VMController }           from "../infrastructure/vm_controller.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepairResult {
  decision: Decision;
  success:  boolean;
  error?:   string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// AutoRepair
// ---------------------------------------------------------------------------

export class AutoRepair {
  private readonly docker: DockerController;
  private readonly vms:    VMController;

  /** Simple exponential back-off tracking per target. */
  private readonly backoff = new Map<string, { count: number; until: number }>();

  constructor(docker: DockerController, vms: VMController) {
    this.docker = docker;
    this.vms    = vms;
  }

  /**
   * Execute a single repair decision. Returns a RepairResult.
   * Governance-class decisions are always rejected here — see ProposalExecutor.
   */
  async fix(decision: Decision): Promise<RepairResult> {
    const start = Date.now();
    const key   = `${decision.kind}:${decision.target ?? ""}`;

    // Back-off check.
    const bo = this.backoff.get(key);
    if (bo && Date.now() < bo.until) {
      return {
        decision,
        success: false,
        error: `Back-off active until ${new Date(bo.until).toISOString()} (attempt ${bo.count})`,
        durationMs: 0,
      };
    }

    try {
      await this.dispatch(decision);
      // Success → reset back-off.
      this.backoff.delete(key);
      return { decision, success: true, durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Exponential back-off: 30s × 2^count, capped at 10 min.
      const attempt = (bo?.count ?? 0) + 1;
      const delay   = Math.min(30_000 * 2 ** (attempt - 1), 600_000);
      this.backoff.set(key, { count: attempt, until: Date.now() + delay });
      console.error(`[AutoRepair] "${decision.kind}(${decision.target})" failed (attempt ${attempt}, backoff ${delay}ms):`, msg);
      return { decision, success: false, error: msg, durationMs: Date.now() - start };
    }
  }

  /**
   * Process a batch of decisions. Stops at maxRepairs infrastructure repairs.
   * Governance decisions are passed through unchanged (caller routes to ProposalExecutor).
   */
  async executeAll(decisions: Decision[], maxRepairs = 5): Promise<RepairResult[]> {
    const results: RepairResult[] = [];
    let repairCount = 0;

    for (const d of decisions) {
      if (this.isGovernanceAction(d.kind)) {
        // Do not act — signal caller.
        console.log(`[AutoRepair] Governance action skipped (forward to ProposalExecutor): ${d.kind}`);
        continue;
      }

      if (repairCount >= maxRepairs) {
        console.warn(`[AutoRepair] maxRepairs=${maxRepairs} reached — deferring remaining decisions.`);
        break;
      }

      const r = await this.fix(d);
      results.push(r);
      if (r.success) repairCount++;
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async dispatch(decision: Decision): Promise<void> {
    const target = decision.target;

    switch (decision.kind) {
      case "restart_container":
        if (!target) throw new Error("restart_container requires a target");
        await this.docker.restartContainer(target);
        break;

      case "rebuild_container":
        if (!target) throw new Error("rebuild_container requires a target");
        // Rebuild is handled by ContainerRebuilder — delegate.
        throw new Error("rebuild_container should be routed to ContainerRebuilder");

      case "restart_vm":
        if (!target) throw new Error("restart_vm requires a target");
        await this.vms.startVm(target);
        break;

      case "rebalance":
        // LoadBalancerAI returns a recommendation; actual re-routing is external.
        console.log("[AutoRepair] Rebalance signal logged — external router must act.");
        break;

      case "noop":
        break;

      default:
        throw new Error(`AutoRepair cannot handle decision kind: ${(decision as Decision).kind}`);
    }
  }

  private isGovernanceAction(kind: DecisionKind): boolean {
    return kind === "governance_alert" || kind === "scale_up" || kind === "network_alert";
  }
}

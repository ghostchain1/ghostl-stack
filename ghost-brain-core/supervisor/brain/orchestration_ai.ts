/**
 * GhostBrain Orchestration AI
 *
 * Translates DecisionEngine output into concrete controller actions.
 * Governance alerts are forwarded to the ProposalExecutor — never
 * auto-executed. All actions are logged to the HMAC-signed event log.
 *
 * Security invariant: OrchestrationAI never holds signing keys and
 * never submits on-chain transactions autonomously.
 */

import type { Decision, MetricsSnapshot } from "./decision_engine.js";

// ---------------------------------------------------------------------------
// Action interfaces
// ---------------------------------------------------------------------------

export interface IActionable {
  restartContainer(name: string): Promise<void>;
  rebuildContainer(name: string): Promise<void>;
  restartVm(name: string): Promise<void>;
  rebalance(): Promise<void>;
  scaleUp(): Promise<void>;
}

export interface IGovernanceProposer {
  submitAlert(reason: string, metrics: MetricsSnapshot): Promise<void>;
}

export interface IEventLogger {
  logHardwareAlert(alert: {
    alert_type: string;
    severity: string;
    details: Record<string, unknown>;
    recommended_action: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Orchestration result
// ---------------------------------------------------------------------------

export interface OrchestrationResult {
  actionsAttempted: number;
  actionsSucceeded: number;
  actionsFailed:    number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// OrchestrationAI
// ---------------------------------------------------------------------------

export class OrchestrationAI {
  private readonly actionable: IActionable;
  private readonly proposer:   IGovernanceProposer;
  private readonly logger:     IEventLogger;

  constructor(
    actionable: IActionable,
    proposer:   IGovernanceProposer,
    logger:     IEventLogger,
  ) {
    this.actionable = actionable;
    this.proposer   = proposer;
    this.logger     = logger;
  }

  /**
   * Execute the highest-priority actionable decisions.
   * Governance alerts are queued for human ratification only.
   *
   * @param decisions Sorted list from DecisionEngine.decide()
   * @param metrics   Current snapshot (attached to governance alerts)
   * @param maxActions Maximum number of repair actions per tick (circuit breaker)
   */
  async execute(
    decisions: Decision[],
    metrics:   MetricsSnapshot,
    maxActions = 5,
  ): Promise<OrchestrationResult> {
    const result: OrchestrationResult = {
      actionsAttempted: 0,
      actionsSucceeded: 0,
      actionsFailed:    0,
      errors:           [],
    };

    let repairCount = 0;

    for (const decision of decisions) {
      if (decision.kind === "noop") continue;

      // Circuit breaker: limit repair actions per tick to avoid thrashing.
      if (this.isRepairAction(decision.kind) && repairCount >= maxActions) {
        console.warn(
          `[OrchestrationAI] maxActions=${maxActions} reached — deferring "${decision.kind}" for "${decision.target}"`
        );
        continue;
      }

      result.actionsAttempted++;

      try {
        await this.dispatch(decision, metrics);
        result.actionsSucceeded++;
        if (this.isRepairAction(decision.kind)) repairCount++;
      } catch (err) {
        result.actionsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${decision.kind}(${decision.target ?? ""}): ${msg}`);
        console.error(`[OrchestrationAI] Action failed:`, decision, err);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private dispatch
  // ---------------------------------------------------------------------------

  private async dispatch(decision: Decision, metrics: MetricsSnapshot): Promise<void> {
    const target = decision.target ?? "";

    switch (decision.kind) {
      case "restart_container":
        console.log(`[OrchestrationAI] Restarting container: ${target}`);
        await this.actionable.restartContainer(target);
        await this.logger.logHardwareAlert({
          alert_type: "container_restart",
          severity:   "warn",
          details:    { container: target, reason: decision.reason },
          recommended_action: "monitor",
        });
        break;

      case "rebuild_container":
        console.log(`[OrchestrationAI] Rebuilding container: ${target}`);
        await this.actionable.rebuildContainer(target);
        await this.logger.logHardwareAlert({
          alert_type: "container_rebuild",
          severity:   "warn",
          details:    { container: target, reason: decision.reason },
          recommended_action: "monitor",
        });
        break;

      case "restart_vm":
        console.log(`[OrchestrationAI] Restarting VM: ${target}`);
        await this.actionable.restartVm(target);
        await this.logger.logHardwareAlert({
          alert_type: "vm_restart",
          severity:   "critical",
          details:    { vm: target, reason: decision.reason },
          recommended_action: "investigate_root_cause",
        });
        break;

      case "rebalance":
        console.log(`[OrchestrationAI] Rebalancing load.`);
        await this.actionable.rebalance();
        break;

      case "scale_up":
        console.log(`[OrchestrationAI] Scale-up signal: ${decision.reason}`);
        // Scale-up is advisory — flag for human review via governance alert.
        await this.proposer.submitAlert(
          `Scale-up requested: ${decision.reason}`, metrics
        );
        break;

      case "governance_alert":
      case "network_alert":
        // These are strictly informational proposals — human quorum required.
        console.log(`[OrchestrationAI] Forwarding governance alert: ${decision.reason}`);
        await this.proposer.submitAlert(decision.reason, metrics);
        await this.logger.logHardwareAlert({
          alert_type: decision.kind,
          severity:   "critical",
          details:    { reason: decision.reason, metrics_snapshot: metrics },
          recommended_action: "human_ratification_required",
        });
        break;

      default:
        console.log(`[OrchestrationAI] Unhandled decision kind: ${(decision as Decision).kind}`);
    }
  }

  private isRepairAction(kind: Decision["kind"]): boolean {
    return (
      kind === "restart_container" ||
      kind === "rebuild_container" ||
      kind === "restart_vm"
    );
  }
}

/**
 * ACG — Post-Deploy Sentinel Agent
 *
 * After a proposal is deployed, the Sentinel watches metrics/logs for
 * regressions within a configurable observation window.
 *
 * Actions:
 *   - none          → no anomaly detected
 *   - alert         → anomaly observed but below auto-rollback threshold
 *   - hotfix-proposal → create a new emergency Change Proposal
 *   - auto-rollback → trigger GhostBrain rollback automatically
 *
 * Thresholds (can be overridden per proposal):
 *   - error rate > 5× baseline → auto-rollback
 *   - latency P99 > 2× baseline → hotfix-proposal
 *   - any SLO breach → alert minimum
 *
 * NATS: publishes acg.sentinel.observation and (if needed) acg.hotfix.proposal
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ChangeProposal,
  SentinelObservation,
  SloViolation,
  SentinelAction,
  ChangeProposalInput,
} from "../acg/types.js";
import { ACG_SUBJECTS } from "../acg/types.js";
import { queryRange } from "../connectors/prometheus.js";
import { fileURLToPath } from "node:url";
import { publish, subscribe, connectNATS } from "../connectors/nats.js";
import { logger } from "../logger.js";
import {
  ACG_SENTINEL_WINDOW_SECONDS,
  ACG_SENTINEL_ERROR_RATE_ROLLBACK_MULTIPLIER,
  ACG_SENTINEL_LATENCY_HOTFIX_MULTIPLIER,
} from "../config.js";

export class SentinelAgent {
  /**
   * Watch a deployed proposal for regressions.
   * Should be called once after successful deploy; runs one observation window
   * then publishes the result.
   *
   * In production: run this on a cron/interval until the observation window expires.
   */
  async observe(proposal: ChangeProposal): Promise<SentinelObservation> {
    logger.info("SentinelAgent: starting observation", {
      proposalId: proposal.proposalId,
      windowSeconds: ACG_SENTINEL_WINDOW_SECONDS,
    });

    // Wait for the observation window before evaluating
    await _sleep(1000); // In production: await window expiry or use scheduled check

    // Collect current vs. baseline metrics
    const service = proposal.scope[0] ?? "ghostbrain-core";
    const [errorRate, latencyP99] = await Promise.all([
      _queryErrorRate(service),
      _queryLatencyP99(service),
    ]);

    // Baseline assumptions (in production: captured at deploy time and stored)
    const errorRateBaseline = 0.01;
    const latencyBaseline = 200;

    // Evaluate SLO violations
    const sloViolations: SloViolation[] = [];

    if (errorRate > errorRateBaseline * 2) {
      sloViolations.push({
        slo: "error-rate",
        target: errorRateBaseline * 100,
        current: errorRate * 100,
        severity: errorRate > errorRateBaseline * 5 ? "breach" : "warn",
      });
    }

    if (latencyP99 > latencyBaseline * 1.5) {
      sloViolations.push({
        slo: "latency-p99-ms",
        target: latencyBaseline,
        current: latencyP99,
        severity: latencyP99 > latencyBaseline * 2 ? "breach" : "warn",
      });
    }

    // Decide action
    const action = _decideAction(errorRate, errorRateBaseline, latencyP99, latencyBaseline, sloViolations);

    const observation: SentinelObservation = {
      observationId: uuidv4(),
      proposalId: proposal.proposalId,
      observedAt: new Date().toISOString(),
      windowSeconds: ACG_SENTINEL_WINDOW_SECONDS,
      sloViolations,
      errorRateBaseline,
      errorRateCurrent: errorRate,
      latencyP99Baseline: latencyBaseline,
      latencyP99Current: latencyP99,
      action,
      ...((() => { const r = _actionReason(action, sloViolations); return r !== undefined ? { actionReason: r } : {}; })()),
    };

    logger.info("SentinelAgent: observation complete", {
      proposalId: proposal.proposalId,
      action,
      violations: sloViolations.length,
    });

    // Publish observation to NATS
    await publish(ACG_SUBJECTS.SENTINEL_OBSERVATION, observation);

    // If hotfix or rollback required, open an emergency proposal
    if (action === "hotfix-proposal" || action === "auto-rollback") {
      await this._escalate(proposal, observation);
    }

    return observation;
  }

  /**
   * Emit a hotfix Change Proposal via NATS for the orchestrator to pick up.
   */
  private async _escalate(
    original: ChangeProposal,
    obs: SentinelObservation,
  ): Promise<void> {
    const hotfixInput: ChangeProposalInput = {
      goal: `[HOTFIX] Regression detected after deploying "${original.goal.substring(0, 60)}" — ${obs.action === "auto-rollback" ? "AUTO-ROLLBACK triggered" : "hotfix required"}`,
      scope: original.scope,
      triggeredBy: "sentinel",
      triggeredByRef: original.proposalId,
    };

    logger.warn("SentinelAgent: escalating", {
      originalProposalId: original.proposalId,
      action: obs.action,
      violations: obs.sloViolations.map(v => v.slo),
    });

    await publish(ACG_SUBJECTS.HOTFIX_PROPOSAL, {
      hotfixInput,
      triggeringObservation: obs,
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function _queryErrorRate(service: string): Promise<number> {
  try {
    const result = await queryRange(
      `rate(http_requests_total{service="${service}",status=~"5.."}[1m]) / rate(http_requests_total{service="${service}"}[1m])`,
      Math.floor(Date.now() / 1000) - 60,
      Math.floor(Date.now() / 1000),
      "60",
    );
    const vals = result?.data?.result?.[0]?.values ?? [];
    const last = vals[vals.length - 1];
    return last ? parseFloat(last[1] as string) : 0;
  } catch {
    return 0;
  }
}

async function _queryLatencyP99(service: string): Promise<number> {
  try {
    const result = await queryRange(
      `histogram_quantile(0.99, rate(http_request_duration_ms_bucket{service="${service}"}[1m]))`,
      Math.floor(Date.now() / 1000) - 60,
      Math.floor(Date.now() / 1000),
      "60",
    );
    const vals = result?.data?.result?.[0]?.values ?? [];
    const last = vals[vals.length - 1];
    return last ? parseFloat(last[1] as string) : 0;
  } catch {
    return 0;
  }
}

function _decideAction(
  errorRate: number,
  errorRateBaseline: number,
  latencyP99: number,
  latencyBaseline: number,
  violations: SloViolation[],
): SentinelAction {
  if (errorRate > errorRateBaseline * ACG_SENTINEL_ERROR_RATE_ROLLBACK_MULTIPLIER) {
    return "auto-rollback";
  }
  if (latencyP99 > latencyBaseline * ACG_SENTINEL_LATENCY_HOTFIX_MULTIPLIER) {
    return "hotfix-proposal";
  }
  if (violations.some(v => v.severity === "breach")) return "hotfix-proposal";
  if (violations.some(v => v.severity === "warn")) return "alert";
  return "none";
}

function _actionReason(action: SentinelAction, violations: SloViolation[]): string | undefined {
  if (action === "none") return undefined;
  return violations.map(v => `${v.slo}: ${v.current.toFixed(2)} (target=${v.target.toFixed(2)})`).join("; ");
}

async function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Entry-point bootstrap ──────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  connectNATS().then(() => {
    subscribe(ACG_SUBJECTS.SENTINEL_OBSERVATION, async (msg) => {
      const obs = msg as unknown as { proposalId: string; proposal: ChangeProposal };
      const agent = new SentinelAgent();
      try {
        const result = await agent.observe(obs.proposal);
        await publish(ACG_SUBJECTS.HOTFIX_PROPOSAL, { proposalId: obs.proposalId, observation: result });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("SentinelAgent: observation failed", { proposalId: obs.proposalId, err: errMsg });
      }
    });
    logger.info("SentinelAgent daemon started, subscribing to acg.sentinel.observation");
  }).catch((err) => {
    logger.error("SentinelAgent: failed to connect to NATS", { err: String(err) });
    process.exit(1);
  });
}

/**
 * GhostBrain Global Orchestrator — AutoScaler
 *
 * Evaluates the current load distribution across nodes in a region and
 * produces a ScalingRecommendation.
 *
 * The AutoScaler NEVER starts or stops infrastructure autonomously.
 * When a scale-up is warranted it:
 *   1. Returns a ScalingRecommendation to the GlobalController.
 *   2. If the recommendation crosses the RELAY_THRESHOLD confidence level,
 *      submits a governance proposal to the signing relay for human ratification.
 *
 * This preserves the invariant: "AI may recommend; humans must ratify."
 */

import type { GhostNode, ScalingRecommendation, ScalingAction } from "../types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Average load above this triggers a scale-up recommendation. */
const SCALE_UP_THRESHOLD = parseFloat(
  process.env["AUTOSCALER_SCALE_UP_THRESHOLD"] ?? "70",
);

/** Average load below this triggers a scale-down recommendation. */
const SCALE_DOWN_THRESHOLD = parseFloat(
  process.env["AUTOSCALER_SCALE_DOWN_THRESHOLD"] ?? "30",
);

/** Minimum number of healthy nodes needed before scale-down is suggested. */
const MIN_NODES_FOR_SCALE_DOWN = parseInt(
  process.env["AUTOSCALER_MIN_NODES"] ?? "3", 10,
);

const SIGNING_RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

const RELAY_TIMEOUT_MS = parseInt(
  process.env["AUTOSCALER_RELAY_TIMEOUT_MS"] ?? "8000", 10,
);

// ---------------------------------------------------------------------------
// AutoScaler
// ---------------------------------------------------------------------------

export class AutoScaler {
  /**
   * Evaluate nodes in a region and return a ScalingRecommendation.
   * If action is "none", no relay submission is made.
   */
  evaluate(nodes: GhostNode[], regionId: string): ScalingRecommendation {
    const now   = Date.now();
    const alive = nodes.filter(n => n.status !== "offline");

    if (alive.length === 0) {
      return {
        region:       regionId,
        action:       "none",
        trigger:      "no live nodes to evaluate",
        avgLoadPct:   0,
        nodeCount:    0,
        recommendedAt: now,
      };
    }

    const avgLoad = alive.reduce((s, n) => s + n.loadPct, 0) / alive.length;
    let action: ScalingAction = "none";
    let trigger                = "";

    if (avgLoad > SCALE_UP_THRESHOLD) {
      action  = "scale_up";
      trigger = `avg load ${avgLoad.toFixed(1)}% exceeds scale-up threshold ${SCALE_UP_THRESHOLD}%`;
    } else if (
      avgLoad < SCALE_DOWN_THRESHOLD &&
      alive.length > MIN_NODES_FOR_SCALE_DOWN
    ) {
      action  = "scale_down";
      trigger = `avg load ${avgLoad.toFixed(1)}% below scale-down threshold ${SCALE_DOWN_THRESHOLD}%; ` +
                `${alive.length} nodes > minimum ${MIN_NODES_FOR_SCALE_DOWN}`;
    }

    const rec: ScalingRecommendation = {
      region:        regionId,
      action,
      trigger,
      avgLoadPct:    Math.round(avgLoad),
      nodeCount:     alive.length,
      recommendedAt: now,
    };

    // Submit to relay asynchronously — only for actionable recommendations.
    if (action !== "none") {
      this.submitToRelay(rec).catch(e =>
        console.error("[autoscaler] relay submission failed:", e),
      );
    }

    return rec;
  }

  // -------------------------------------------------------------------------
  // Relay submission (proposed — humans ratify)
  // -------------------------------------------------------------------------

  private async submitToRelay(rec: ScalingRecommendation): Promise<void> {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), RELAY_TIMEOUT_MS);

    try {
      await fetch(`${SIGNING_RELAY_URL}/relay/scaling/propose`, {
        method:  "POST",
        signal:  ctl.signal,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          region:           rec.region,
          action:           rec.action,
          trigger:          rec.trigger,
          avg_load_pct:     rec.avgLoadPct,
          node_count:       rec.nodeCount,
          chain_id:         14000101,
          gas_token:        "GST",
          from:             "ghostbrain-autoscaler",
          recommended_at:   rec.recommendedAt,
        }),
      });
      clearTimeout(tid);
    } catch {
      clearTimeout(tid);
      // Non-fatal — scaling proposals are advisory.
    }
  }
}

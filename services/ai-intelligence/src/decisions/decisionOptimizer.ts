/**
 * decisionOptimizer.ts — Rule-based ecosystem action recommendations
 *
 * Analyses the latest EcosystemSnapshot + PredictionResults and emits a
 * prioritised list of recommended actions.  This engine does NOT issue HTTP
 * calls to other services — it produces recommendations only.  The GSCC or a
 * human operator can choose to act on them.
 *
 * Rules are straightforward threshold comparisons; the engine is designed to
 * grow as the ecosystem matures.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import type { EcosystemSnapshot } from "../data/dataAggregator";
import type { PredictionResult }  from "../prediction/predictionEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DecisionPriority = "critical" | "high" | "medium" | "low";
export type DecisionStatus   = "pending" | "executed" | "dismissed";

export interface Decision {
  id:             string;
  timestamp:      number;
  category:       string;
  priority:       DecisionPriority;
  action:         string;
  rationale:      string;
  targetEngine:   string;
  estimatedImpact: string;
  status:         DecisionStatus;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const MAX_DECISIONS = 500;
const decisions: Decision[] = [];

// ── Rule helpers ──────────────────────────────────────────────────────────────

function decide(
  category:    string,
  priority:    DecisionPriority,
  action:      string,
  rationale:   string,
  target:      string,
  impact:      string,
): Decision {
  return {
    id:             uuidv4(),
    timestamp:      Date.now(),
    category,
    priority,
    action,
    rationale,
    targetEngine:   target,
    estimatedImpact: impact,
    status:         "pending",
  };
}

// ── Decision rules ────────────────────────────────────────────────────────────

function rulesFromSnapshot(snap: EcosystemSnapshot): Decision[] {
  const recs: Decision[] = [];

  // ── Infra rules ────────────────────────────────────────────────────────────
  const offlineEngines = Object.entries(snap.services)
    .filter(([, s]) => !s.online)
    .map(([id]) => id);

  if (offlineEngines.length >= 4) {
    recs.push(decide(
      "infrastructure", "critical",
      "Trigger full GhostStack health-check and alert operator",
      `${offlineEngines.length} services are offline: ${offlineEngines.join(", ")}`,
      "AIE",
      "Prevent cascading failure across ecosystem",
    ));
  } else if (offlineEngines.length > 0) {
    recs.push(decide(
      "infrastructure", "high",
      `Restart offline services: ${offlineEngines.join(", ")}`,
      `${offlineEngines.length} service(s) are not reachable`,
      "AIE",
      "Restore ecosystem to full capacity",
    ));
  }

  if (snap.infraStatus && snap.infraStatus !== "healthy") {
    recs.push(decide(
      "infrastructure", "high",
      "Run AIE automated repair sequence",
      `Infrastructure status reported as "${snap.infraStatus}"`,
      "AIE",
      "Return infra to healthy baseline",
    ));
  }

  // ── Security rules ─────────────────────────────────────────────────────────
  if (snap.threats !== null) {
    if (snap.threats >= 5) {
      recs.push(decide(
        "security", "critical",
        "Escalate all active threats to ASE — increase scan frequency to 60 s",
        `${snap.threats} active threats detected in ecosystem`,
        "ASE",
        "Reduce attack surface, protect validator and liquidity assets",
      ));
    } else if (snap.threats >= 2) {
      recs.push(decide(
        "security", "high",
        "Increase ASE threat-scan frequency and notify validators",
        `${snap.threats} threats require elevated monitoring`,
        "ASE",
        "Early detection before escalation",
      ));
    }
  }

  // ── Growth rules ───────────────────────────────────────────────────────────
  if (snap.users !== null && snap.users < 1_000) {
    recs.push(decide(
      "marketing", "medium",
      "Launch user acquisition campaign via AIMS",
      `User count (${snap.users}) is below early-adopter threshold`,
      "AIMS",
      "+15-25% user growth within 30 days",
    ));
  }

  if (snap.marketingROI !== null && snap.marketingROI < 1.5) {
    recs.push(decide(
      "marketing", "medium",
      "Rebalance AIMS campaign budget towards highest-ROI channels",
      `Current blended marketing ROI (${snap.marketingROI.toFixed(2)}×) is below the 1.5× target`,
      "AIMS",
      "Improve ROI to ≥1.5× within 14 days",
    ));
  }

  // ── Liquidity rules ────────────────────────────────────────────────────────
  if (snap.tvl !== null && snap.tvl < 5_000_000) {
    recs.push(decide(
      "economy", "medium",
      "Increase liquidity mining rewards via AEE",
      `TVL ($${snap.tvl.toLocaleString()}) is below the $5M operational threshold`,
      "AEE",
      "+20-40% TVL increase within 60 days",
    ));
  }

  // ── Validator rules ────────────────────────────────────────────────────────
  if (snap.validators !== null && snap.validators < 10) {
    recs.push(decide(
      "validator", "high",
      "Incentivise new validator onboarding via AAE expansion programme",
      `Active validator count (${snap.validators}) is critically low`,
      "AAE",
      "Double validator count within 90 days",
    ));
  }

  return recs;
}

function rulesFromPredictions(preds: PredictionResult[]): Decision[] {
  const recs: Decision[] = [];
  const pred30 = preds.find((p) => p.horizon === "30d");
  if (!pred30) return recs;

  const { users, tvl, validators } = pred30.predictions;

  if (
    users.growthRate !== null &&
    users.growthRate < 0.003 // less than 0.3%/day growth in 30d outlook
  ) {
    recs.push(decide(
      "growth", "medium",
      "Intensify developer and community outreach via VGE + AIMS",
      `30-day user growth forecast is only ${(users.growthRate * 30 * 100).toFixed(1)}% — below the 10% monthly target`,
      "VGE",
      "+8-12% additional user growth via targeted grants and campaigns",
    ));
  }

  if (
    tvl.growthRate !== null &&
    tvl.growthRate < 0.004
  ) {
    recs.push(decide(
      "economy", "medium",
      "Activate liquidity incentive burst via GEE + AEE",
      `30-day TVL growth forecast (${(tvl.growthRate * 30 * 100).toFixed(1)}%) is below the 15% monthly target`,
      "GEE",
      "+15-25% TVL growth through targeted incentives",
    ));
  }

  if (
    validators.growthRate !== null &&
    validators.growthRate < 0.001
  ) {
    recs.push(decide(
      "validator", "low",
      "Launch validator recruitment drive via AAE",
      `30-day validator growth forecast is only ${(validators.growthRate * 30 * 100).toFixed(1)}%`,
      "AAE",
      "+10 validators within 30 days",
    ));
  }

  return recs;
}

// ── Public: run optimiser ─────────────────────────────────────────────────────

export function optimizeDecisions(
  snap:  EcosystemSnapshot  | null,
  preds: PredictionResult[] | null,
): Decision[] {
  const batch: Decision[] = [];

  if (snap)  batch.push(...rulesFromSnapshot(snap));
  if (preds) batch.push(...rulesFromPredictions(preds));

  // De-duplicate by action string
  const seen = new Set<string>();
  const deduped = batch.filter((d) => {
    if (seen.has(d.action)) return false;
    seen.add(d.action);
    return true;
  });

  // Sort: critical → high → medium → low
  const ORDER: Record<DecisionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  deduped.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);

  decisions.unshift(...deduped);
  if (decisions.length > MAX_DECISIONS) decisions.splice(MAX_DECISIONS);

  logger.info(`[DecisionOptimizer] Generated ${deduped.length} recommendations (${deduped.filter((d) => d.priority === "critical").length} critical)`);
  return deduped;
}

// ── Status updates ────────────────────────────────────────────────────────────

export function updateDecisionStatus(id: string, status: DecisionStatus): boolean {
  const d = decisions.find((dec) => dec.id === id);
  if (!d) return false;
  d.status = status;
  return true;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getDecisions(limit = 50): Decision[] { return decisions.slice(0, limit); }
export function getPendingDecisions():     Decision[] { return decisions.filter((d) => d.status === "pending"); }

export function getDecisionStats() {
  const total     = decisions.length;
  const pending   = decisions.filter((d) => d.status === "pending").length;
  const executed  = decisions.filter((d) => d.status === "executed").length;
  const dismissed = decisions.filter((d) => d.status === "dismissed").length;
  const byPriority: Record<DecisionPriority, number> = {
    critical: decisions.filter((d) => d.priority === "critical").length,
    high:     decisions.filter((d) => d.priority === "high").length,
    medium:   decisions.filter((d) => d.priority === "medium").length,
    low:      decisions.filter((d) => d.priority === "low").length,
  };
  return { total, pending, executed, dismissed, byPriority };
}

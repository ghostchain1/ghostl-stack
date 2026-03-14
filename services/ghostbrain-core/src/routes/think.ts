/**
 * think.ts
 *
 * POST /think
 * GhostBrain inference endpoint. Accepts a natural-language or
 * structured query and returns a reasoning response, recommended
 * action, and confidence score.
 */

import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";
import pino from "pino";

const log = pino({ name: "ghostbrain-core/think" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThinkRequest {
  context?: string;        // Free-text situational context
  query: string;           // The question or decision to reason about
  signals?: string[];      // Optional signal IDs to include as context
  mode?: "fast" | "deep";  // "fast" = lightweight, "deep" = full reasoning chain
}

export interface ThinkResponse {
  ok: boolean;
  query: string;
  reasoning: string;
  recommendation: string;
  confidence: number;       // 0–1
  actions: SuggestedAction[];
  processedAt: string;
}

export interface SuggestedAction {
  action: string;
  priority: "low" | "medium" | "high" | "critical";
  rationale: string;
}

// ── Inference engine (stub — swap with LLM or rule engine) ───────────────────

function runInference(req: ThinkRequest): Omit<ThinkResponse, "ok" | "processedAt"> {
  const { query, context = "", mode = "fast" } = req;

  // Deterministic heuristic reasoning for common GhostChain patterns
  const lower = query.toLowerCase();

  let reasoning = `Analyzing query: "${query}"`;
  let recommendation = "Monitor situation and gather more data.";
  let confidence = 0.55;
  const actions: SuggestedAction[] = [];

  if (lower.includes("validator") && (lower.includes("slash") || lower.includes("offline"))) {
    reasoning = "Detected validator health concern. Cross-referencing uptime metrics and stake position.";
    recommendation = "Initiate validator redundancy protocol and alert ops team.";
    confidence = 0.87;
    actions.push({ action: "trigger_validator_health_check", priority: "high", rationale: "Validator may be offline or at slash risk." });
    actions.push({ action: "notify_ops", priority: "medium", rationale: "Ops team should manually verify." });
  } else if (lower.includes("governance") || lower.includes("proposal")) {
    reasoning = "Governance event detected. Evaluating proposal parameters and quorum status.";
    recommendation = "Review proposal against GhostChain governance charter and community signals.";
    confidence = 0.79;
    actions.push({ action: "sync_governance_state", priority: "medium", rationale: "Ensure local governance state is current." });
  } else if (lower.includes("liquidity") || lower.includes("pool")) {
    reasoning = "Liquidity condition query. Checking pool ratios and slippage thresholds.";
    recommendation = "Evaluate rebalance trigger conditions against current TVL.";
    confidence = 0.72;
    actions.push({ action: "rebalance_liquidity", priority: "medium", rationale: "Maintain target pool ratios." });
  } else if (lower.includes("attack") || lower.includes("threat") || lower.includes("security")) {
    reasoning = "Security concern identified. Elevating threat level and scanning network metrics.";
    recommendation = "Engage security protocol and isolate affected vectors immediately.";
    confidence = 0.93;
    actions.push({ action: "trigger_security_scan", priority: "critical", rationale: "Potential threat requires immediate assessment." });
    actions.push({ action: "firewall_update", priority: "high", rationale: "Harden perimeter while investigation proceeds." });
  }

  if (mode === "deep" && context) {
    reasoning += ` | Deep mode: incorporating context "${context.slice(0, 120)}..."`;
    confidence = Math.min(confidence + 0.05, 0.99);
  }

  return { query, reasoning, recommendation, confidence, actions };
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: RouterType = Router();

/**
 * POST /think
 * Body: ThinkRequest
 */
router.post("/", (req: Request, res: Response) => {
  const body = req.body as Partial<ThinkRequest>;

  if (!body.query || typeof body.query !== "string" || body.query.trim() === "") {
    res.status(400).json({ ok: false, error: "query (non-empty string) is required" });
    return;
  }

  const thinkReq: ThinkRequest = {
    query: body.query.trim(),
    context: typeof body.context === "string" ? body.context : undefined,
    signals: Array.isArray(body.signals) ? body.signals : undefined,
    mode: body.mode === "deep" ? "deep" : "fast",
  };

  log.info({ query: thinkReq.query, mode: thinkReq.mode }, "think request received");

  const result = runInference(thinkReq);

  const response: ThinkResponse = {
    ok: true,
    ...result,
    processedAt: new Date().toISOString(),
  };

  log.info({ confidence: response.confidence, actions: response.actions.length }, "think response ready");
  res.json(response);
});

export default router;

/**
 * GhostBrain Infrastructure Simulator — Safety Evaluator
 *
 * Examines a simulated (pre → post) state transition and issues a verdict:
 *
 *   approve               — safe to execute autonomously
 *   block                 — too dangerous; do not execute
 *   require_ratification  — requires human governance quorum before execution
 *
 * Rules applied in priority order (first matching rule wins):
 *
 *   R1  Unknown action (confidence = 0)           → block
 *   R2  Low model confidence (< MIN_CONFIDENCE)   → block
 *   R3  Post-state host CPU > CPU_HARD_BLOCK      → block
 *   R4  Post-state host mem > MEM_HARD_BLOCK      → block
 *   R5  Any critical risk in outcome              → block (or ratification for chain nodes)
 *   R6  Any risk with category chain_downtime     → require_ratification for L1
 *   R7  Evict or migrate on a chain node          → require_ratification
 *   R8  Action on L1 when L1 is only live chain   → require_ratification
 *   R9  High risks on non-chain targets           → block if urgency < "high"
 *   R10 Default                                   → approve
 *
 * All thresholds are configurable via environment variables so operators can
 * tune without a code change.
 */

import type {
  SimState,
  SimRisk,
  SimVerdict,
  SimOutcome,
  SimAction,
  SimRiskSeverity,
} from "./sim_model.js";
import { simulateAction }  from "./action_simulator.js";

// ── Thresholds ────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE   = Number(process.env.SIM_MIN_CONFIDENCE    ?? "40");   // 0-100
const CPU_HARD_BLOCK   = Number(process.env.SIM_CPU_HARD_BLOCK    ?? "97");   // %
const MEM_HARD_BLOCK   = Number(process.env.SIM_MEM_HARD_BLOCK    ?? "95");   // %
const CPU_SOFT_WARN    = Number(process.env.SIM_CPU_SOFT_WARN     ?? "88");
const MEM_SOFT_WARN    = Number(process.env.SIM_MEM_SOFT_WARN     ?? "85");

// ── Helpers ───────────────────────────────────────────────────────────────────

function maxRiskSeverity(risks: SimRisk[]): SimRiskSeverity | null {
  const order: SimRiskSeverity[] = ["low", "medium", "high", "critical"];
  let max = -1;
  for (const r of risks) {
    const idx = order.indexOf(r.severity);
    if (idx > max) max = idx;
  }
  return max >= 0 ? order[max]! : null;
}

function hasRisk(risks: SimRisk[], cat: SimRisk["category"]): boolean {
  return risks.some(r => r.category === cat);
}

function highProbCritical(risks: SimRisk[]): SimRisk | undefined {
  return risks.find(r => r.severity === "critical" && r.probability >= 0.7);
}

/** Does the action target a chain node (l1/l2/l3)? */
function isChainTarget(action: SimAction, state: SimState): "l1" | "l2" | "l3" | undefined {
  const c = state.containers[action.targetId];
  return c?.chainLayer;
}

function aliveChains(state: SimState): number {
  return [state.chains.l1, state.chains.l2, state.chains.l3].filter(c => c.alive).length;
}

// ── Core evaluation ───────────────────────────────────────────────────────────

interface EvalResult {
  verdict:       SimVerdict;
  verdictReason: string;
}

export function evaluate(
  action:    SimAction,
  preState:  SimState,
  postState: SimState,
  confidence: number,
  risks:      SimRisk[],
): EvalResult {

  // R1 — unknown / unsimulable action
  if (confidence === 0) {
    return { verdict: "block", verdictReason: "Confidence is 0 — cannot model action impact safely." };
  }

  // R2 — model confidence too low
  if (confidence < MIN_CONFIDENCE) {
    return {
      verdict:       "block",
      verdictReason: `Model confidence ${confidence}% is below minimum threshold ${MIN_CONFIDENCE}%.`,
    };
  }

  // R3 — post-action CPU wall
  if (postState.host.cpuPct > CPU_HARD_BLOCK) {
    return {
      verdict:       "block",
      verdictReason: `Post-action host CPU predicted at ${Math.round(postState.host.cpuPct)}% — above hard limit ${CPU_HARD_BLOCK}%.`,
    };
  }

  // R4 — post-action memory wall
  if (postState.host.memPct > MEM_HARD_BLOCK) {
    return {
      verdict:       "block",
      verdictReason: `Post-action host memory predicted at ${Math.round(postState.host.memPct)}% — above hard limit ${MEM_HARD_BLOCK}%.`,
    };
  }

  // R5 — high-probability critical risk
  const crit = highProbCritical(risks);
  if (crit) {
    const layer = isChainTarget(action, preState);
    // Critical risk on chain node: ratification rather than outright block
    // (operator may intentionally want to restart a broken chain node)
    if (layer) {
      return {
        verdict:       "require_ratification",
        verdictReason: `Critical risk detected on ${layer.toUpperCase()} chain node: ${crit.description}`,
      };
    }
    return {
      verdict:       "block",
      verdictReason: `Critical risk (p=${crit.probability.toFixed(2)}): ${crit.description}`,
    };
  }

  // R6 — any chain downtime risk on L1
  if (hasRisk(risks, "chain_downtime")) {
    const layer = isChainTarget(action, preState);
    if (layer === "l1") {
      return {
        verdict:       "require_ratification",
        verdictReason: "Action affects L1 chain node — human ratification required for any chain_downtime risk.",
      };
    }
  }

  // R7 — evict or migrate a chain node
  if (action.type === "evict_container" || action.type === "migrate_workload") {
    const layer = isChainTarget(action, preState);
    if (layer) {
      return {
        verdict:       "require_ratification",
        verdictReason: `${action.type} on ${layer.toUpperCase()} chain node requires governance ratification.`,
      };
    }
  }

  // R8 — action on L1 when L1 is the only live chain
  const layer = isChainTarget(action, preState);
  if (layer === "l1" && aliveChains(preState) <= 1) {
    return {
      verdict:       "require_ratification",
      verdictReason: "L1 is the only live chain. Any L1 action requires ratification.",
    };
  }

  // R9 — high severity non-critical risks on low-urgency actions
  const maxSev = maxRiskSeverity(risks);
  if (maxSev === "high" && action.urgency === "low") {
    return {
      verdict:       "block",
      verdictReason: `High-severity risks detected for low-urgency action "${action.type}" — escalation required.`,
    };
  }

  // R10 — soft warns (log but approve)
  const warnings: string[] = [];
  if (postState.host.cpuPct > CPU_SOFT_WARN) {
    warnings.push(`host CPU will be at ~${Math.round(postState.host.cpuPct)}%`);
  }
  if (postState.host.memPct > MEM_SOFT_WARN) {
    warnings.push(`host memory will be at ~${Math.round(postState.host.memPct)}%`);
  }

  return {
    verdict:       "approve",
    verdictReason: warnings.length
      ? `Approved with warnings: ${warnings.join("; ")}.`
      : "Simulation completed — no safety violations detected.",
  };
}

// ── One-shot composite function ───────────────────────────────────────────────

/**
 * Run the full simulate → evaluate pipeline and return a complete SimOutcome.
 * This is the primary entry point for callers.
 */
export function runSimulation(preState: SimState, action: SimAction): SimOutcome {
  const delta  = simulateAction(preState, action);
  const result = evaluate(action, preState, delta.postState, delta.confidence, delta.risks);

  return {
    action,
    preState,
    postState:     delta.postState,
    deltaMs:       delta.deltaMs,
    confidence:    delta.confidence,
    risks:         delta.risks,
    verdict:       result.verdict,
    verdictReason: result.verdictReason,
    simulatedAt:   Date.now(),
  };
}

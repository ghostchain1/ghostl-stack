/**
 * GhostChain Global Governance AI — GovernanceAI
 *
 * Central AI reasoning layer for the GhostStack governance system.
 * GovernanceAI evaluates proposals holistically, combining simulation output,
 * historical governance patterns, validator sentiment, and constitutional
 * compliance to produce a structured advisory recommendation.
 *
 * Advisory model:
 *   Every evaluation produces a GovernanceAdvisory with:
 *     - An overall APPROVE / CAUTION / REJECT recommendation
 *     - Confidence score ∈ [0, 1]
 *     - Risk factors enumerated with severity (LOW / MEDIUM / HIGH / CRITICAL)
 *     - Historical precedent match (if a similar past proposal exists)
 *     - Constitutional compliance check result
 *     - GhostBrain correlation id (for linkage to the global pattern store)
 *
 * AI autonomy boundaries (HARD RULES):
 *   1. GovernanceAI NEVER submits on-chain transactions.
 *   2. GovernanceAI NEVER overrides vote results.
 *   3. Recommendations are attached to proposals as advisory metadata only.
 *   4. Humans ratify all execution through the signing relay multi-sig.
 *
 * Integration with GhostBrain Core (:7900):
 *   - Forwards all evaluations for pattern learning and cross-system correlation.
 *   - Requests historical analysis from GhostBrain's governance history store.
 *   - Anomalous governance activity alerts are escalated to GhostBrain Sentinel.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

import type { SimulationResult } from "../simulation/governance_simulator.js";
import type { VoteTally }        from "../voting/vote_coordinator.js";

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;

const MAX_ADVISORY_HISTORY = 2_000;
const MIN_CONFIDENCE_WARMUP = 3;   // Need ≥ N historical precedents for high confidence

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalCategory =
  | "PROTOCOL_UPGRADE"
  | "TREASURY_POLICY"
  | "VALIDATOR_RULES"
  | "ECONOMIC_PARAMS"
  | "CONSTITUTION";

export type TargetLayer = "L1" | "L2" | "L3";

export type AdvisoryRecommendation = "APPROVE" | "CAUTION" | "REJECT";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFactor {
  id:          string;
  description: string;
  severity:    RiskSeverity;
  dimension:   string;
}

export interface ConstitutionalCheck {
  compliant:    boolean;
  clausesChecked: string[];
  violations:   string[];
}

export interface HistoricalPrecedent {
  found:             boolean;
  similarProposalId?: string;
  similarity:        number;  // [0, 1]
  outcome?:          "PASSED" | "DEFEATED" | "EXECUTED" | "CANCELLED";
  notes:             string;
}

export interface GovernanceAdvisory {
  proposalId:        string;
  category:          ProposalCategory;
  targetLayer:       TargetLayer;
  recommendation:    AdvisoryRecommendation;
  confidence:        number;              // [0, 1]
  riskFactors:       RiskFactor[];
  constitutional:    ConstitutionalCheck;
  precedent:         HistoricalPrecedent;
  simulationScore:   number;             // pass-through from GovernanceSimulator
  aiScore:           number;             // composite AI score [0, 1] (1 = safe)
  ghostbrainCorrId?: string;             // GhostBrain correlation id
  evaluatedAt:       number;             // Unix seconds
  chain_id:          number;
  gas_token:         string;
  notes:             string;
}

export interface EvaluationRequest {
  proposalId:      string;
  description:     string;
  category:        ProposalCategory;
  targetLayer:     TargetLayer;
  simulation?:     SimulationResult;
  currentTally?:   VoteTally;            // Optional live tally (for mid-vote analysis)
  metadata?:       Record<string, unknown>;
}

export interface GovernanceAIOptions {
  ghostbrainUrl?: string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── GovernanceAI ──────────────────────────────────────────────────────────────

export class GovernanceAI {
  private readonly ghostbrainUrl: string;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  private readonly advisoryHistory: GovernanceAdvisory[] = [];

  constructor(opts: GovernanceAIOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Evaluate a governance proposal and produce a structured advisory.
   * Combines local rules-engine + GhostBrain pattern analysis.
   */
  async evaluate(req: EvaluationRequest): Promise<GovernanceAdvisory> {
    // Step 1: Local constitutional compliance check.
    const constitutional = this._checkConstitution(req);

    // Step 2: Local risk factor extraction.
    const riskFactors = this._extractRiskFactors(req, constitutional);

    // Step 3: Query GhostBrain for historical precedent and deep scoring.
    const [precedent, brainScore, corrId] = await this._queryGhostBrain(req);

    // Step 4: Composite AI score.
    const simScore  = req.simulation?.aggregateScore ?? 0.5;
    const localScore = this._localAiScore(req, riskFactors, constitutional);
    // Blend: GhostBrain 60%, local 40%.
    const aiScore   = clamp01(brainScore * 0.6 + localScore * 0.4);

    // Step 5: Recommendation.
    const recommendation = this._recommend(aiScore, constitutional, riskFactors);

    // Step 6: Confidence (rises with precedent count and sim score alignment).
    const confidence = this._computeConfidence(aiScore, simScore, precedent);

    const advisory: GovernanceAdvisory = {
      proposalId:      req.proposalId,
      category:        req.category,
      targetLayer:     req.targetLayer,
      recommendation,
      confidence,
      riskFactors,
      constitutional,
      precedent,
      simulationScore: simScore,
      aiScore,
      ghostbrainCorrId: corrId,
      evaluatedAt:     nowSec(),
      chain_id:        L1_CHAIN_ID,
      gas_token:       "GST",
      notes:           this._buildNotes(recommendation, riskFactors, constitutional),
    };

    this._storeAdvisory(advisory);
    void this._publishToGhostBrain(advisory);

    return advisory;
  }

  /** Retrieve advisory for a proposal (most recent). */
  getAdvisory(proposalId: string): GovernanceAdvisory | undefined {
    for (let i = this.advisoryHistory.length - 1; i >= 0; i--) {
      if (this.advisoryHistory[i]!.proposalId === proposalId) return this.advisoryHistory[i];
    }
    return undefined;
  }

  /** List recent advisories. */
  listAdvisories(limit = 50): GovernanceAdvisory[] {
    return this.advisoryHistory.slice(-limit).reverse();
  }

  // ── Internal — Constitutional Compliance ──────────────────────────────────

  /**
   * Light-weight constitutional compliance check using clause tags.
   *
   * GhostConstitution clauses that governance AI enforces:
   *   C-01: No supply modification without quorum ≥ 5%
   *   C-02: Constitution amendments require 7-day timelock
   *   C-03: No validator set reduction below MIN_VALIDATORS (21)
   *   C-04: Treasury disbursements require GhostChainGovernor approval
   *   C-05: L3 proposals must finalize on L1
   */
  private _checkConstitution(req: EvaluationRequest): ConstitutionalCheck {
    const desc       = req.description.toLowerCase();
    const violations: string[] = [];
    const clausesChecked: string[] = ["C-01", "C-02", "C-03", "C-04", "C-05"];

    // C-01: Supply modification check.
    if (/\b(mint|inflate|emission|supply)\b/.test(desc) && req.category !== "TREASURY_POLICY")
      violations.push("C-01: Supply modification detected outside TREASURY_POLICY category");

    // C-02: Constitution amendment timelock warning (informational — Engine enforces timing).
    if (req.category === "CONSTITUTION" && req.targetLayer !== "L1")
      violations.push("C-02: Constitution amendments must target L1");

    // C-03: Validator set reduction.
    if (/\b(reduce|remove|slash|ban)\b.*\b(validator|validators)\b/.test(desc))
      violations.push("C-03: Validator set reduction proposal — minimum validator count must be preserved");

    // C-04: Treasury requires Governor routing.
    if (req.category === "TREASURY_POLICY" && /\b(direct|bypass|skip)\b/.test(desc))
      violations.push("C-04: Treasury disbursement must route through GhostChainGovernor");

    // C-05: L3 must finalize on L1.
    if (req.targetLayer === "L3" && /\b(finalize|finalise|settle)\b.*\b(l3|layer.?3)\b/.test(desc))
      violations.push("C-05: L3 proposals must finalize on GhostChain L1");

    return {
      compliant:      violations.length === 0,
      clausesChecked,
      violations,
    };
  }

  // ── Internal — Risk Factor Extraction ─────────────────────────────────────

  private _extractRiskFactors(
    req:              EvaluationRequest,
    constitutional:   ConstitutionalCheck,
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const desc = req.description.toLowerCase();

    // Constitutional violations → CRITICAL.
    for (const v of constitutional.violations) {
      factors.push({
        id:          `CONST-${factors.length + 1}`,
        description: v,
        severity:    "CRITICAL",
        dimension:   "CONSTITUTIONAL",
      });
    }

    // Protocol upgrade risk.
    if (req.category === "PROTOCOL_UPGRADE") {
      factors.push({
        id:          "PROTO-01",
        description: "Protocol upgrades carry consensus fork risk — validator coordination required",
        severity:    "HIGH",
        dimension:   "CONSENSUS_IMPACT",
      });
    }

    // Emergency / disable keywords.
    if (/\b(emergency|disable|freeze|halt)\b/.test(desc)) {
      factors.push({
        id:          "SEC-01",
        description: "Emergency/disable operation detected — irreversibility review required",
        severity:    "HIGH",
        dimension:   "SECURITY_IMPACT",
      });
    }

    // Bridge exposure.
    if (/\b(bridge|escrow|lock|relay)\b/.test(desc)) {
      factors.push({
        id:          "BRIDGE-01",
        description: "Bridge parameter change may affect cross-chain liquidity",
        severity:    "MEDIUM",
        dimension:   "BRIDGE_IMPACT",
      });
    }

    // Simulation failure.
    if (req.simulation && req.simulation.outcome === "FAILED") {
      factors.push({
        id:          "SIM-01",
        description: `Simulation scored ${req.simulation.aggregateScore.toFixed(3)} — FAILED threshold`,
        severity:    "CRITICAL",
        dimension:   "SIMULATION",
      });
    } else if (req.simulation && req.simulation.outcome === "WARNED") {
      factors.push({
        id:          "SIM-02",
        description: `Simulation outcome WARNED (score=${req.simulation.aggregateScore.toFixed(3)})`,
        severity:    "MEDIUM",
        dimension:   "SIMULATION",
      });
    }

    // Gas parameter changes.
    if (/\b(gas|fee|price)\b/.test(desc) && req.category === "ECONOMIC_PARAMS") {
      factors.push({
        id:          "ECON-01",
        description: "Gas parameter change may affect network throughput and user costs",
        severity:    "LOW",
        dimension:   "ECONOMIC_IMPACT",
      });
    }

    return factors;
  }

  // ── Internal — Local AI Score ──────────────────────────────────────────────

  private _localAiScore(
    req:            EvaluationRequest,
    riskFactors:    RiskFactor[],
    constitutional: ConstitutionalCheck,
  ): number {
    let score = 0.8; // Start optimistic.

    // Penalise per severity.
    for (const rf of riskFactors) {
      const penalty = { LOW: 0.02, MEDIUM: 0.08, HIGH: 0.15, CRITICAL: 0.30 }[rf.severity] ?? 0;
      score -= penalty;
    }

    // Constitutional violation → heavy penalty.
    if (!constitutional.compliant) score -= 0.25 * constitutional.violations.length;

    // Simulation alignment bonus.
    if (req.simulation) score += (req.simulation.aggregateScore - 0.5) * 0.2;

    return clamp01(score);
  }

  // ── Internal — GhostBrain Query ───────────────────────────────────────────

  private async _queryGhostBrain(
    req: EvaluationRequest,
  ): Promise<[HistoricalPrecedent, number, string | undefined]> {
    const payload = {
      proposal_id:  req.proposalId,
      description:  req.description,
      category:     req.category,
      target_layer: req.targetLayer,
      chain_id:     L1_CHAIN_ID,
      gas_token:    "GST",
      timestamp:    nowSec(),
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/ai-evaluate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as GhostBrainEvalResponse;

      const precedent: HistoricalPrecedent = {
        found:             data.precedent_found ?? false,
        similarProposalId: data.similar_proposal_id,
        similarity:        clamp01(data.similarity ?? 0),
        outcome:           data.precedent_outcome as HistoricalPrecedent["outcome"],
        notes:             data.precedent_notes ?? "",
      };

      return [precedent, clamp01(data.ai_score ?? 0.5), data.corr_id];
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceAI] GhostBrain query failed:", err.message);

      return [
        { found: false, similarity: 0, notes: "GhostBrain unavailable" },
        0.5,
        undefined,
      ];
    }
  }

  // ── Internal — Recommendation + Confidence ────────────────────────────────

  private _recommend(
    aiScore:        number,
    constitutional: ConstitutionalCheck,
    riskFactors:    RiskFactor[],
  ): AdvisoryRecommendation {
    const hasCritical = riskFactors.some((r) => r.severity === "CRITICAL");
    if (!constitutional.compliant || hasCritical || aiScore < 0.3) return "REJECT";
    if (aiScore < 0.6) return "CAUTION";
    return "APPROVE";
  }

  private _computeConfidence(
    aiScore:     number,
    simScore:    number,
    precedent:   HistoricalPrecedent,
  ): number {
    // Base: alignment between AI score and sim score.
    const alignment = 1 - Math.abs(aiScore - simScore);
    let confidence  = alignment * 0.6;

    // Boost from precedent.
    if (precedent.found && precedent.similarity > 0.7) confidence += 0.3;
    else if (precedent.found)                          confidence += 0.1;

    // Reduce when not enough history.
    if (!precedent.found) confidence *= 0.7;

    return clamp01(confidence);
  }

  // ── Internal — Notes ──────────────────────────────────────────────────────

  private _buildNotes(
    rec:        AdvisoryRecommendation,
    risks:      RiskFactor[],
    const_:     ConstitutionalCheck,
  ): string {
    const parts: string[] = [];

    if (rec === "APPROVE")  parts.push("Proposal appears well-formed and low-risk.");
    if (rec === "CAUTION")  parts.push("Proposal has medium-risk factors — human review recommended before voting.");
    if (rec === "REJECT")   parts.push("Proposal has critical issues — submission not recommended.");

    if (!const_.compliant)
      parts.push(`Constitutional violations: ${const_.violations.join("; ")}`);

    const critical = risks.filter((r) => r.severity === "CRITICAL");
    if (critical.length > 0)
      parts.push(`Critical risks: ${critical.map((r) => r.description).join("; ")}`);

    return parts.join(" | ");
  }

  // ── Internal — Storage + GhostBrain Publish ───────────────────────────────

  private _storeAdvisory(advisory: GovernanceAdvisory): void {
    this.advisoryHistory.push(advisory);
    if (this.advisoryHistory.length > MAX_ADVISORY_HISTORY) this.advisoryHistory.shift();
  }

  private async _publishToGhostBrain(advisory: GovernanceAdvisory): Promise<void> {
    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/advisory`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(advisory),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceAI] GhostBrain publish failed:", err.message);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ── GhostBrain Response Shape ─────────────────────────────────────────────────

interface GhostBrainEvalResponse {
  ai_score?:           number;
  precedent_found?:    boolean;
  similar_proposal_id?: string;
  similarity?:         number;
  precedent_outcome?:  string;
  precedent_notes?:    string;
  corr_id?:            string;
}

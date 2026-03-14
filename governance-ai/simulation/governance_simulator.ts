/**
 * GhostChain Global Governance AI — Governance Simulator
 *
 * Evaluates governance proposals BEFORE they go to vote by simulating their
 * likely network impact across six risk dimensions.  Results are advisory only
 * — they inform the ProposalEngine's go/no-go decision but cannot block
 * on-chain voting.
 *
 * Simulation dimensions:
 *   CONSENSUS_IMPACT   — risk to validator set stability, fork probability
 *   ECONOMIC_IMPACT    — GST supply, inflation, treasury balance effects
 *   SECURITY_IMPACT    — attack surface changes, slashing parameter shifts
 *   BRIDGE_IMPACT      — interchain bridge liquidity / finality risk
 *   IDENTITY_IMPACT    — GNS / GID registry disruption risk
 *   CONSTITUTIONAL     — compliance with GhostConstitution clauses
 *
 * Scoring:
 *   Each dimension receives a score ∈ [0, 1] (1 = fully safe, 0 = critical risk).
 *   An aggregate safety score is computed as a weighted mean.
 *   If any dimension is below CRITICAL_THRESHOLD (0.2) the simulation is FAILED.
 *
 * Implementation:
 *   Local fast simulation uses heuristic keyword/pattern match on the proposal
 *   description and category.  A full deep simulation is requested from
 *   GhostBrain Core (:7900) which runs multi-chain state projections.
 *   The simulator combines both results.
 *
 * Advisory-only:
 *   Simulation results are attached to proposals as metadata and forwarded to
 *   GhostBrain.  They never block transaction submission autonomously.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101 as const;

const CRITICAL_THRESHOLD = 0.2;     // Any dimension below this = FAILED
const WARN_THRESHOLD     = 0.5;     // Warn but allow
const MAX_SIM_HISTORY    = 1_000;   // Bounded result history

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalCategory =
  | "PROTOCOL_UPGRADE"
  | "TREASURY_POLICY"
  | "VALIDATOR_RULES"
  | "ECONOMIC_PARAMS"
  | "CONSTITUTION";

export type TargetLayer = "L1" | "L2" | "L3";

export type SimulationOutcome = "PASSED" | "WARNED" | "FAILED";

export type SimulationDimension =
  | "CONSENSUS_IMPACT"
  | "ECONOMIC_IMPACT"
  | "SECURITY_IMPACT"
  | "BRIDGE_IMPACT"
  | "IDENTITY_IMPACT"
  | "CONSTITUTIONAL";

export interface DimensionScore {
  dimension: SimulationDimension;
  score:     number;              // [0, 1]
  notes:     string;
}

export interface SimulationResult {
  proposalId:    string;
  category:      ProposalCategory;
  targetLayer:   TargetLayer;
  outcome:       SimulationOutcome;
  aggregateScore: number;         // weighted mean [0, 1]
  dimensions:    DimensionScore[];
  warnings:      string[];
  simulatedAt:   number;          // Unix seconds
  ghostbrainAugmented: boolean;  // true if GhostBrain deep sim was consulted
}

export interface SimulationRequest {
  proposalId:    string;
  description:   string;
  category:      ProposalCategory;
  targetLayer:   TargetLayer;
  metadata?:     Record<string, unknown>;
}

export interface GovernanceSimulatorOptions {
  ghostbrainUrl?: string;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Dimension Weights (sum = 1.0) ─────────────────────────────────────────────

const DIMENSION_WEIGHTS: Record<SimulationDimension, number> = {
  CONSENSUS_IMPACT: 0.25,
  ECONOMIC_IMPACT:  0.25,
  SECURITY_IMPACT:  0.20,
  BRIDGE_IMPACT:    0.10,
  IDENTITY_IMPACT:  0.10,
  CONSTITUTIONAL:   0.10,
};

// ── GovernanceSimulator ───────────────────────────────────────────────────────

export class GovernanceSimulator {
  private readonly ghostbrainUrl: string;
  private readonly fetcher:        (url: string, init?: RequestInit) => Promise<Response>;

  private readonly history: SimulationResult[] = [];

  constructor(opts: GovernanceSimulatorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.fetcher       = opts.fetcher       ?? ((u, i) => fetch(u, i));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run a full simulation for a proposal.
   * Combines fast local heuristics with GhostBrain deep-sim (if available).
   */
  async simulate(req: SimulationRequest): Promise<SimulationResult> {
    // Fast local heuristic.
    const localDimensions = this._localHeuristics(req);

    // Request GhostBrain deep simulation (non-blocking; failures fall back to local).
    const brainDimensions = await this._deepSimulate(req);
    const augmented       = brainDimensions !== null;

    // Merge: GhostBrain scores take precedence if available.
    const merged = this._mergeDimensions(localDimensions, brainDimensions);

    const aggregateScore = this._weightedMean(merged);
    const warnings       = this._collectWarnings(merged);
    const outcome        = this._determineOutcome(aggregateScore, merged);

    const result: SimulationResult = {
      proposalId:          req.proposalId,
      category:            req.category,
      targetLayer:         req.targetLayer,
      outcome,
      aggregateScore,
      dimensions:          merged,
      warnings,
      simulatedAt:         nowSec(),
      ghostbrainAugmented: augmented,
    };

    this._storeResult(result);
    return result;
  }

  /** Retrieve recent simulation history. */
  recentResults(limit = 50): SimulationResult[] {
    return this.history.slice(-limit).reverse();
  }

  /** Look up a past result by proposalId. */
  getResult(proposalId: string): SimulationResult | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i]!.proposalId === proposalId) return this.history[i];
    }
    return undefined;
  }

  // ── Internal — Local Heuristics ───────────────────────────────────────────

  /**
   * Fast rule-based heuristic dimension scoring based on category and
   * description keyword patterns.  Returns [0,1] scores per dimension.
   *
   * Heuristics:
   *   PROTOCOL_UPGRADE → lower consensus safety (complex change)
   *   CONSTITUTION     → lower constitutional safety (sensitive)
   *   VALIDATOR_RULES  → affects consensus
   *   ECONOMIC_PARAMS  → affects economic stability
   *   keywords: "remove", "disable", "slash", "freeze" → lower security score
   *   keywords: "bridge", "lock", "escrow"             → lower bridge score
   */
  private _localHeuristics(req: SimulationRequest): DimensionScore[] {
    const desc = req.description.toLowerCase();

    const hasRiskyKeyword = /\b(remove|disable|slash|freeze|drain|emergency)\b/.test(desc);
    const hasBridgeWord   = /\b(bridge|lock|escrow|relay)\b/.test(desc);
    const hasLargeSupply  = /\b(mint|inflate|supply|emission)\b/.test(desc);

    const baseConsensus   = req.category === "PROTOCOL_UPGRADE" ? 0.5
                          : req.category === "VALIDATOR_RULES"  ? 0.6
                          : 0.8;
    const baseEconomic    = req.category === "ECONOMIC_PARAMS"  ? 0.55
                          : req.category === "TREASURY_POLICY"  ? 0.65
                          : 0.8;
    const baseSecurity    = hasRiskyKeyword ? 0.45 : 0.8;
    const baseBridge      = hasBridgeWord   ? 0.5  : 0.85;
    const baseIdentity    = 0.85;  // Most proposals don't touch GID
    const baseConst       = req.category === "CONSTITUTION" ? 0.4 : 0.9;

    return [
      dim("CONSENSUS_IMPACT", clamp01(baseConsensus - (hasRiskyKeyword ? 0.15 : 0)),
          req.category === "PROTOCOL_UPGRADE" ? "Protocol upgrade carries fork risk" : ""),
      dim("ECONOMIC_IMPACT", clamp01(baseEconomic - (hasLargeSupply ? 0.2 : 0)),
          hasLargeSupply ? "Supply-side change detected" : ""),
      dim("SECURITY_IMPACT", baseSecurity,
          hasRiskyKeyword ? "Risky operation keyword detected" : ""),
      dim("BRIDGE_IMPACT", baseBridge,
          hasBridgeWord ? "Bridge parameter may be affected" : ""),
      dim("IDENTITY_IMPACT", baseIdentity, ""),
      dim("CONSTITUTIONAL", baseConst,
          req.category === "CONSTITUTION" ? "Constitution amendment — extra scrutiny required" : ""),
    ];
  }

  // ── Internal — GhostBrain Deep Simulation ─────────────────────────────────

  private async _deepSimulate(req: SimulationRequest): Promise<DimensionScore[] | null> {
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
      const res = await this.fetcher(`${this.ghostbrainUrl}/governance/deep-simulate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { dimensions: Array<{ dimension: string; score: number; notes: string }> };

      return data.dimensions.map((d) => dim(
        d.dimension as SimulationDimension,
        clamp01(d.score),
        d.notes ?? "",
      ));
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[GovernanceSimulator] GhostBrain deep-sim unavailable:", err.message);
      return null;
    }
  }

  // ── Internal — Scoring ────────────────────────────────────────────────────

  private _mergeDimensions(
    local:  DimensionScore[],
    brain:  DimensionScore[] | null,
  ): DimensionScore[] {
    if (!brain) return local;

    // Build lookup for brain scores.
    const brainMap = new Map<SimulationDimension, DimensionScore>();
    for (const d of brain) brainMap.set(d.dimension, d);

    return local.map((l) => {
      const b = brainMap.get(l.dimension);
      if (!b) return l;
      // Blend: GhostBrain score 70%, local 30%.
      const blended = clamp01(b.score * 0.7 + l.score * 0.3);
      return dim(l.dimension, blended, b.notes || l.notes);
    });
  }

  private _weightedMean(dimensions: DimensionScore[]): number {
    let sum = 0;
    let w   = 0;
    for (const d of dimensions) {
      const weight = DIMENSION_WEIGHTS[d.dimension] ?? 0;
      sum += d.score * weight;
      w   += weight;
    }
    return w > 0 ? clamp01(sum / w) : 0;
  }

  private _collectWarnings(dimensions: DimensionScore[]): string[] {
    return dimensions
      .filter((d) => d.score < WARN_THRESHOLD)
      .map((d) => `${d.dimension}: score=${d.score.toFixed(3)}${d.notes ? ` — ${d.notes}` : ""}`);
  }

  private _determineOutcome(aggregate: number, dimensions: DimensionScore[]): SimulationOutcome {
    const criticalFail = dimensions.some((d) => d.score < CRITICAL_THRESHOLD);
    if (criticalFail || aggregate < CRITICAL_THRESHOLD) return "FAILED";
    if (aggregate < WARN_THRESHOLD) return "WARNED";
    return "PASSED";
  }

  // ── Internal — History ────────────────────────────────────────────────────

  private _storeResult(result: SimulationResult): void {
    this.history.push(result);
    if (this.history.length > MAX_SIM_HISTORY) this.history.shift();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function dim(dimension: SimulationDimension, score: number, notes: string): DimensionScore {
  return { dimension, score: clamp01(score), notes };
}

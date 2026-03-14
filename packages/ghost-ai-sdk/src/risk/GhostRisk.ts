/**
 * GhostRisk — composite transaction risk assessment engine
 *
 * Layers four independent sources into a single normalised score (0..1)
 * and a human-readable risk level:
 *
 *   1. Static audit    — selector reputation + address sanity (ContractAuditor)
 *   2. Value heuristic — large native-value transfer detection
 *   3. Simulation      — eth_call + revert decoding (optional, async)
 *   4. AI guard        — GhostBrain selector scoring (optional, async)
 *
 * Usage:
 *   import { ghost } from "@ghost/ai-sdk"
 *
 *   const risk = new ghost.Risk(provider)
 *   const report = await risk.scoreTransaction({ to, data, value })
 *   if (!report.safe) throw new Error(report.summary)
 */

import type { TransactionRequest } from "@ghostchain/sdk";
import { ContractAuditor }         from "../audit/ContractAuditor.js";
import type { AuditFinding }       from "../audit/Types.js";
import type { GhostJsonRpcProvider } from "../chain/GhostJsonRpcProvider.js";
import type { GhostLayer }         from "../chain/Types.js";

// ============================================================================
// Public types
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFinding {
  /** Which subsystem produced this finding. */
  source:   "static" | "simulation" | "ai" | "heuristic";
  severity: "info" | "warn" | "high" | "critical";
  code:     string;
  message:  string;
  meta?:    unknown;
}

export interface GhostRiskReport {
  /** Normalised composite risk score 0 (safe) .. 1 (critical). */
  score:      number;
  level:      RiskLevel;
  /** false when score >= options.blockThreshold (default 0.7). */
  safe:       boolean;
  findings:   RiskFinding[];
  simulation?: {
    success:      boolean;
    returnData:   string;
    revertReason?: string;
  };
  /** Single-sentence decision summary. */
  summary:    string;
  latencyMs:  number;
}

// ============================================================================
// Options
// ============================================================================

export interface GhostRiskOptions {
  /** Inject a custom auditor instance. Defaults to a new ContractAuditor(). */
  auditor?: ContractAuditor;
  /**
   * Whether to run eth_call simulation before scoring.
   * Adds one RPC round-trip. Default: false.
   */
  simulate?: boolean;
  /**
   * Whether to query GhostBrain's AI guard for additional scoring.
   * Requires the provider to be constructed with a ghostBrain URL.
   * Default: true.
   */
  aiGuard?: boolean;
  /**
   * Native-value threshold in wei above which a "large transfer" heuristic
   * finding is added. Default: 1 GST (10^18).
   */
  largeValueThresholdWei?: bigint;
  /**
   * Any transaction scoring >= this threshold will have safe: false.
   * Default: 0.70.
   */
  blockThreshold?: number;
  /**
   * ABI fragments passed through to ContractAuditor for calldata decoding.
   */
  abi?: string[];
}

// ============================================================================
// Weight table (must sum to 1.0)
// ============================================================================

const W = {
  static:     0.30,
  heuristic:  0.15,
  simulation: 0.20,
  ai:         0.35,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/** Map a numeric score to a risk level. */
export function levelFromScore(score: number): RiskLevel {
  if (score >= 0.85) return "critical";
  if (score >= 0.60) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

/** Convert AuditFinding severity to RiskFinding severity. */
function auditLevelToSeverity(level: AuditFinding["level"]): RiskFinding["severity"] {
  return level === "high" ? "high" : level === "warn" ? "warn" : "info";
}

// ============================================================================
// GhostRisk
// ============================================================================

export class GhostRisk {
  private readonly provider:   GhostJsonRpcProvider;
  private readonly auditor:    ContractAuditor;
  private readonly opts: Required<GhostRiskOptions>;

  constructor(provider: GhostJsonRpcProvider, opts: GhostRiskOptions = {}) {
    this.provider = provider;
    this.auditor  = opts.auditor ?? new ContractAuditor();
    this.opts = {
      auditor:                opts.auditor             ?? this.auditor,
      simulate:               opts.simulate             ?? false,
      aiGuard:                opts.aiGuard              ?? true,
      largeValueThresholdWei: opts.largeValueThresholdWei ?? 1_000_000_000_000_000_000n, // 1 GST
      blockThreshold:         opts.blockThreshold       ?? 0.70,
      abi:                    opts.abi                  ?? [],
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Full async risk assessment — runs all four subsystems in parallel.
   */
  async scoreTransaction(tx: TransactionRequest): Promise<GhostRiskReport> {
    const t0 = Date.now();
    const findings: RiskFinding[] = [];

    const to   = typeof tx.to    === "string" ? tx.to    : String(tx.to    ?? "");
    const data = typeof tx.data  === "string" ? tx.data  : "0x";
    const value = typeof tx.value === "bigint" ? tx.value :
                  tx.value != null             ? BigInt(String(tx.value)) : 0n;

    // ── 1. Static audit (sync) ───────────────────────────────────────────────
    const auditResult = this.auditor.auditTx({ to, data, abi: this.opts.abi });
    for (const f of auditResult.findings) {
      findings.push({
        source:   "static",
        severity: auditLevelToSeverity(f.level),
        code:     f.code,
        message:  f.message,
        meta:     f.meta,
      });
    }
    const staticScore = auditResult.riskScore;

    // ── 2. Value heuristic (sync) ────────────────────────────────────────────
    let heuristicScore = 0;
    if (value >= this.opts.largeValueThresholdWei) {
      const eth = Number(value / 1_000_000_000_000_000n) / 1_000;
      findings.push({
        source:   "heuristic",
        severity: "warn",
        code:     "LARGE_NATIVE_VALUE",
        message:  `Large native-value transfer: ${eth.toFixed(4)} GST`,
        meta:     { value: value.toString() },
      });
      heuristicScore = Math.min(1, 0.30 + Number(value / this.opts.largeValueThresholdWei) * 0.05);
    }

    // Contract creation heuristic
    if (!to || to === "0x" || to === "0x0000000000000000000000000000000000000000") {
      findings.push({
        source:   "heuristic",
        severity: "warn",
        code:     "CONTRACT_CREATION",
        message:  "Transaction deploys a contract (to=null/zero)",
      });
      heuristicScore = Math.max(heuristicScore, 0.25);
    }

    // ── 3 + 4. Async: simulation + AI guard (parallel, best-effort) ──────────
    let simulationScore = 0;
    let simResult: GhostRiskReport["simulation"] | undefined;

    let aiScore = 0;

    await Promise.all([
      // Simulation
      this.opts.simulate
        ? this.provider.simulateTx({ to, data, value }).then(r => {
            simResult = r;
            if (!r.success) {
              simulationScore = 0.80;
              findings.push({
                source:   "simulation",
                severity: "high",
                code:     "SIMULATION_REVERT",
                message:  r.revertReason ?? "Transaction reverted during simulation",
                meta:     { returnData: r.returnData },
              });
            } else {
              simulationScore = 0.0;
              findings.push({
                source:   "simulation",
                severity: "info",
                code:     "SIMULATION_OK",
                message:  "eth_call simulation passed",
              });
            }
          }).catch(err => {
            findings.push({
              source:   "simulation",
              severity: "warn",
              code:     "SIMULATION_ERROR",
              message:  `Simulation failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          })
        : Promise.resolve(),

      // AI guard
      this.opts.aiGuard
        ? this.provider.guardContractCall({ to, data, value }).then(r => {
            aiScore = r.riskScore;
            for (const msg of r.findings) {
              findings.push({
                source:   "ai",
                severity: r.riskScore >= 0.85 ? "critical" : r.riskScore >= 0.5 ? "high" : "warn",
                code:     "AI_FINDING",
                message:  msg,
              });
            }
          }).catch(() => { /* AI offline — skip */ })
        : Promise.resolve(),
    ]);

    // ── Composite score ──────────────────────────────────────────────────────
    const composite =
      W.static     * staticScore     +
      W.heuristic  * heuristicScore  +
      W.simulation * simulationScore +
      W.ai         * aiScore;

    const score = Math.min(1, Math.max(0, composite));
    const level = levelFromScore(score);
    const safe  = score < this.opts.blockThreshold;

    const topSeverity = findings.find(f => f.severity === "critical")?.message
                     ?? findings.find(f => f.severity === "high")?.message
                     ?? findings.find(f => f.severity === "warn")?.message;
    const summary = safe
      ? `Risk ${level} (${(score * 100).toFixed(0)}%) — transaction permitted`
      : `Risk ${level} (${(score * 100).toFixed(0)}%) — ${topSeverity ?? "blocked by policy"}`;

    return {
      score: parseFloat(score.toFixed(4)),
      level,
      safe,
      findings,
      ...(simResult !== undefined ? { simulation: simResult } : {}),
      summary,
      latencyMs: Date.now() - t0,
    };
  }

  /**
   * Synchronous static-only assessment — no RPC calls, instant.
   * Covers static audit + value heuristics only (score is indicative).
   */
  scoreStatic(params: {
    to:     string;
    data?:  string;
    value?: bigint;
    abi?:   string[];
  }): GhostRiskReport {
    const t0       = Date.now();
    const findings: RiskFinding[] = [];
    const value    = params.value ?? 0n;

    const auditResult = this.auditor.auditTx({
      to:   params.to,
      data: params.data,
      abi:  params.abi ?? this.opts.abi,
    });
    for (const f of auditResult.findings) {
      findings.push({
        source:   "static",
        severity: auditLevelToSeverity(f.level),
        code:     f.code,
        message:  f.message,
        meta:     f.meta,
      });
    }

    let heuristicScore = 0;
    if (value >= this.opts.largeValueThresholdWei) {
      const eth = Number(value / 1_000_000_000_000_000n) / 1_000;
      findings.push({
        source:   "heuristic",
        severity: "warn",
        code:     "LARGE_NATIVE_VALUE",
        message:  `Large native-value transfer: ${eth.toFixed(4)} GST`,
        meta:     { value: value.toString() },
      });
      heuristicScore = 0.30;
    }

    const score = Math.min(1, W.static * auditResult.riskScore + W.heuristic * heuristicScore);
    const level = levelFromScore(score);
    const safe  = score < this.opts.blockThreshold;

    return {
      score: parseFloat(score.toFixed(4)),
      level,
      safe,
      findings,
      summary: safe
        ? `Static risk ${level} (${(score * 100).toFixed(0)}%) — no blockers`
        : `Static risk ${level} (${(score * 100).toFixed(0)}%) — review required`,
      latencyMs: Date.now() - t0,
    };
  }

  /**
   * Convert a numeric score 0..1 to a RiskLevel string.
   * Useful for comparing external scores with GhostRisk thresholds.
   */
  static levelFromScore(score: number): RiskLevel {
    return levelFromScore(score);
  }

  /** The layer of the underlying provider. */
  get layer(): GhostLayer {
    return this.provider.layer;
  }
}

/**
 * GhostBrain Memory Engine — Resource Optimizer
 *
 * Selects the least-loaded node from the supervisor's current snapshot,
 * cross-referenced with memory-derived failure history to avoid routing work
 * to nodes that have been recently unstable.
 *
 * This extends the existing load_balancer_ai.ts logic with historical
 * awareness: a node that has generated many recent failure events is penalised
 * in the composite score even if its instantaneous CPU/memory looks healthy.
 *
 * No shell calls, no external network I/O. Pure in-memory scoring.
 */

import type { MemoryReader } from "../engine/memory_reader.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** A candidate node as fed by the MetricsCollector or load_balancer_ai. */
export interface CandidateNode {
  /** Unique name must match the `source` field used in MemoryRecords. */
  name: string;
  cpuPct:       number;    // 0–100
  memPct:       number;    // 0–100
  activeConns:  number;    // concurrent connection count
  /** True if the node is currently reported unhealthy by a controller. */
  unhealthy?:   boolean;
}

export interface OptimisationResult {
  /** Recommended target node. */
  target: CandidateNode;
  /** Composite score (lower = better), post-penalty. */
  compositeScore: number;
  /** Number of candidates considered. */
  candidateCount: number;
  /** Nodes excluded due to unhealthy flag or excessive history failures. */
  skipped: number;
  /** Penalty applied to selected node (for observability). */
  historyPenalty: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Weights must sum to 1.0 */
const W_CPU  = parseFloat(process.env["OPT_W_CPU"]  ?? "0.5");
const W_MEM  = parseFloat(process.env["OPT_W_MEM"]  ?? "0.3");
const W_CONN = parseFloat(process.env["OPT_W_CONN"] ?? "0.2");

/** Window for failure event lookback. Default: 30 minutes. */
const HISTORY_WINDOW_MS = parseInt(process.env["OPT_HISTORY_WINDOW_MS"] ?? "1800000", 10);

/** Failure events per node above this count add a 10-point score penalty each. */
const PENALTY_PER_FAILURE = parseInt(process.env["OPT_PENALTY_PER_FAILURE"] ?? "10", 10);
const PENALTY_THRESHOLD   = parseInt(process.env["OPT_PENALTY_THRESHOLD"]   ?? "2",  10);

/** Normalise connection count against this ceiling. */
const CONN_CEILING = parseInt(process.env["OPT_CONN_CEILING"] ?? "1000", 10);

/** Categories considered as failures for history scoring. */
const FAILURE_CATEGORIES: EventCategory[] = [
  "docker_failure", "docker_oom", "docker_exit",
  "vm_crash", "vm_offline",
  "network_degraded", "network_error_spike",
  "repair_failed",
];

// ---------------------------------------------------------------------------
// ResourceOptimizer
// ---------------------------------------------------------------------------

export class ResourceOptimizer {
  constructor(private readonly reader: MemoryReader) {}

  /**
   * Select the best target node from the candidate list.
   * Skips nodes that are flagged unhealthy by the controller layer.
   * Applies a history-based penalty for nodes with recent failure events.
   *
   * Returns null if all candidates are unhealthy or the list is empty.
   */
  optimize(nodes: CandidateNode[]): OptimisationResult | null {
    if (nodes.length === 0) return null;

    // Exclude nodes currently marked unhealthy.
    const eligible = nodes.filter(n => !n.unhealthy);
    const skipped  = nodes.length - eligible.length;

    if (eligible.length === 0) return null;

    // Build failure count per source from the memory index.
    const failureCounts = this.buildFailureCounts();

    // Score each eligible node.
    const scored = eligible.map(n => {
      const base     = this.baseScore(n);
      const failures = failureCounts.get(n.name) ?? 0;
      const excess   = Math.max(0, failures - PENALTY_THRESHOLD);
      const penalty  = excess * PENALTY_PER_FAILURE;
      return { node: n, score: base + penalty, penalty, failures };
    });

    // Sort ascending (lower = better).
    scored.sort((a, b) => a.score - b.score);
    const best = scored[0]!;

    return {
      target:         best.node,
      compositeScore: Math.round(best.score * 100) / 100,
      candidateCount: eligible.length,
      skipped,
      historyPenalty: best.penalty,
    };
  }

  /**
   * Diagnostic: return scores for all nodes (including skipped unhealthy ones),
   * sorted ascending. Useful for the supervisor_api.ts /metrics endpoint.
   */
  scoreAll(nodes: CandidateNode[]): Array<{
    name: string; baseScore: number; historyPenalty: number; totalScore: number; failures: number;
  }> {
    const failureCounts = this.buildFailureCounts();
    return nodes
      .map(n => {
        const base     = this.baseScore(n);
        const failures = failureCounts.get(n.name) ?? 0;
        const excess   = Math.max(0, failures - PENALTY_THRESHOLD);
        const penalty  = excess * PENALTY_PER_FAILURE;
        return {
          name:           n.name,
          baseScore:      Math.round(base * 100) / 100,
          historyPenalty: penalty,
          totalScore:     Math.round((base + penalty) * 100) / 100,
          failures,
        };
      })
      .sort((a, b) => a.totalScore - b.totalScore);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Weighted composite base score (no history penalty). Lower = better. */
  private baseScore(n: CandidateNode): number {
    const cpuScore  = n.cpuPct;
    const memScore  = n.memPct;
    const connScore = Math.min((n.activeConns / CONN_CEILING) * 100, 100);
    return W_CPU * cpuScore + W_MEM * memScore + W_CONN * connScore;
  }

  /**
   * Build a map of failure event counts per source name from the memory index,
   * looking back `HISTORY_WINDOW_MS` milliseconds.
   */
  private buildFailureCounts(): Map<string, number> {
    const since   = Date.now() - HISTORY_WINDOW_MS;
    const counts  = new Map<string, number>();

    for (const cat of FAILURE_CATEGORIES) {
      const records = this.reader.query({ categories: [cat], since });
      for (const r of records) {
        counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
      }
    }

    return counts;
  }
}

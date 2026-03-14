/**
 * Load Balancer AI
 *
 * Selects the least-loaded eligible node from a pool for work assignment.
 * The selection algorithm is a composite weighted score; AI augmentation
 * (GhostBrain /v1/classify) provides an additional risk overlay.
 *
 * This component only RECOMMENDS a target — actual traffic routing is
 * performed by external infrastructure (HAProxy, iptables, etc.).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeLoad {
  /** Unique node identifier (hostname or container name). */
  id:          string;
  /** CPU utilisation 0–100. */
  cpuPct:      number;
  /** Memory utilisation 0–100. */
  memPct:      number;
  /** Active connections / in-flight requests. */
  connections: number;
  /** Whether the node is reachable for health checks. */
  healthy:     boolean;
  /** Optional custom score override (0–100; lower = preferred). */
  customScore?: number;
}

export interface RebalanceResult {
  target:           NodeLoad;
  compositeScore:   number;
  candidateCount:   number;
  skippedUnhealthy: number;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const W_CPU  = Number(process.env["LB_WEIGHT_CPU"]  ?? "0.5");
const W_MEM  = Number(process.env["LB_WEIGHT_MEM"]  ?? "0.3");
const W_CONN = Number(process.env["LB_WEIGHT_CONN"] ?? "0.2");

// Max connections used for normalisation (clamp at 1 000).
const MAX_CONN = Number(process.env["LB_MAX_CONN"] ?? "1000");

const GHOSTBRAIN_API_URL =
  process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ---------------------------------------------------------------------------
// LoadBalancerAI
// ---------------------------------------------------------------------------

export class LoadBalancerAI {
  /**
   * Select the optimal target node from a pool.
   * Healthy nodes are ranked by composite weighted score; GhostBrain risk
   * scores are fetched and applied as a tiebreaker.
   *
   * @returns RebalanceResult or null if no healthy nodes exist.
   */
  async rebalance(nodes: NodeLoad[]): Promise<RebalanceResult | null> {
    const healthy  = nodes.filter(n => n.healthy);
    const skipped  = nodes.length - healthy.length;

    if (healthy.length === 0) {
      console.warn("[LoadBalancerAI] No healthy nodes available.");
      return null;
    }

    // Fetch AI risk overlay for each node (best-effort).
    const riskScores = await this.fetchRiskScores(healthy);

    // Compute composite score (lower = better).
    const scored = healthy.map(n => {
      const connNorm = Math.min(n.connections / MAX_CONN, 1) * 100;
      let score = W_CPU  * n.cpuPct
                + W_MEM  * n.memPct
                + W_CONN * connNorm;

      // Apply AI risk overlay (0–1 → 0–20 penalty points).
      const risk = riskScores.get(n.id) ?? 0;
      score += risk * 20;

      // Apply explicit custom score override if set.
      if (typeof n.customScore === "number") score = n.customScore;

      return { node: n, score };
    });

    // Sort ascending by composite score (lowest load first).
    scored.sort((a, b) => a.score - b.score);

    const best = scored[0]!;

    console.log(
      `[LoadBalancerAI] Selected "${best.node.id}" ` +
      `(score=${best.score.toFixed(1)} cpu=${best.node.cpuPct}% mem=${best.node.memPct}%)`
    );

    return {
      target:           best.node,
      compositeScore:   best.score,
      candidateCount:   healthy.length,
      skippedUnhealthy: skipped,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async fetchRiskScores(nodes: NodeLoad[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    try {
      const res = await fetch(`${GHOSTBRAIN_API_URL}/v1/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(2_000),
        body: JSON.stringify({
          context: "load-balancer-node-selection",
          data: { nodes: nodes.map(n => ({ id: n.id, cpu: n.cpuPct, mem: n.memPct })) },
        }),
      });
      if (res.ok) {
        const body = await res.json() as { node_risks?: Record<string, number> };
        for (const [id, score] of Object.entries(body.node_risks ?? {})) {
          if (typeof score === "number") result.set(id, score);
        }
      }
    } catch {
      // GhostBrain unreachable — proceed without risk overlay.
    }
    return result;
  }
}

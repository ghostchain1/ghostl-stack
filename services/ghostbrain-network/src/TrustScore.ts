/**
 * TrustScore — computes and tracks reliability scores for GhostBrain nodes.
 */
export interface NodeHistory {
  successCount:  number;
  failureCount:  number;
  uptimePercent: number;
}

export class TrustScore {
  calculate(history: NodeHistory): number {
    const successRate = history.successCount / Math.max(history.successCount + history.failureCount, 1);
    const uptimeFactor = history.uptimePercent / 100;
    return Math.round(successRate * 70 + uptimeFactor * 30);  // weighted score 0-100
  }

  /** Fast-gossip trust update after a confirmed action. */
  update(current: number, outcome: "success" | "failure"): number {
    const delta = outcome === "success" ? 2 : -5;
    return Math.max(0, Math.min(100, current + delta));
  }
}

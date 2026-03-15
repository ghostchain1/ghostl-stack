/**
 * RiskAnalyzer — evaluates simulation outcomes and classifies risk.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskReport {
  level:       RiskLevel;
  score:       number;      // 0-100
  factors:     string[];
  recommended: string;
}

export class RiskAnalyzer {
  analyze(simResult: Record<string, unknown>): RiskReport {
    const factors: string[] = [];
    let score = 0;

    if ((simResult["cascadeRisk"] as string) === "HIGH")          { score += 40; factors.push("cascade failure risk"); }
    if ((simResult["consensusAffected"] as boolean))              { score += 35; factors.push("consensus integrity at risk"); }
    if ((simResult["predictedDowntime"] as number) > 60)          { score += 20; factors.push("significant downtime expected"); }
    if ((simResult["predictedPriceChange"] as number) < -15)      { score += 25; factors.push("severe price impact"); }
    if ((simResult["slippageBps"] as number) > 100)               { score += 15; factors.push("high slippage"); }
    if (!(simResult["networkSafe"] as boolean))                   { score += 50; factors.push("network safety compromised"); }
    if ((simResult["predictedLatencyMs"] as number) > 200)        { score += 10; factors.push("high latency predicted"); }

    const level: RiskLevel = score >= 60 ? "CRITICAL"
                           : score >= 40 ? "HIGH"
                           : score >= 20 ? "MEDIUM"
                           : "LOW";

    return {
      level,
      score,
      factors,
      recommended: level === "CRITICAL" ? "abort_and_escalate"
                 : level === "HIGH"     ? "require_governor_approval"
                 : level === "MEDIUM"   ? "proceed_with_monitoring"
                 : "proceed",
    };
  }
}

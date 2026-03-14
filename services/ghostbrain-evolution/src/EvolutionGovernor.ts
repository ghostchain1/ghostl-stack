/**
 * EvolutionGovernor — approves or vetoes upgrade plans and experiments.
 */
import { UpgradePlan } from "./UpgradePlanner";
import { Experiment, ExperimentResult } from "./ExperimentEngine";

export class EvolutionGovernor {
  private readonly riskThreshold: "low" | "medium" | "high";
  private readonly minConfidence:  number;

  constructor(opts?: { riskThreshold?: "low" | "medium" | "high"; minConfidence?: number }) {
    this.riskThreshold = opts?.riskThreshold ?? "medium";
    this.minConfidence = opts?.minConfidence ?? 0.8;
  }

  approvePlan(plan: UpgradePlan): boolean {
    const riskLevel = { low: 0, medium: 1, high: 2 } as const;
    const allowed   = riskLevel[plan.totalRisk] <= riskLevel[this.riskThreshold];
    console.log(
      `[EvolutionGovernor] Plan ${plan.id} (risk: ${plan.totalRisk}) → ${allowed ? "APPROVED" : "VETOED"}`
    );
    return allowed;
  }

  approveExperiment(exp: Experiment, result: ExperimentResult): boolean {
    if (result.winner === "inconclusive") {
      console.log(`[EvolutionGovernor] Experiment ${exp.id} inconclusive — no adoption`);
      return false;
    }
    const allowed = result.confidence >= this.minConfidence;
    console.log(
      `[EvolutionGovernor] Experiment ${exp.id} (confidence ${(result.confidence * 100).toFixed(1)} %) ` +
      `→ ${allowed ? "ADOPT" : "REJECT"}`
    );
    return allowed;
  }
}

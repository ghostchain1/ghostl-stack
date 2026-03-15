/**
 * StrategySimulator — pre-evaluates strategies before execution.
 */
export interface SimResult {
  action:           string;
  predictedImpact:  Record<string, number>;
  safe:             boolean;
}

export class StrategySimulator {
  simulate(action: string): SimResult {
    const impacts: Record<string, Record<string, number>> = {
      restart_node:        { predicted_uptime_improvement: 20, estimated_downtime_seconds: 30 },
      scale_rpc_nodes:     { predicted_latency_reduction: 40, cost_increase_percent: 15 },
      adjust_gas_engine:   { predicted_gas_reduction: 10, risk_score: 2 },
      isolate_validator:   { predicted_security_improvement: 50, consensus_impact: 5 },
      rebalance_liquidity: { predicted_slippage_reduction: 15, capital_moved_percent: 20 },
      trigger_error_repair:{ predicted_build_success_rate: 80, time_to_fix_seconds: 120 },
    };

    const impact = impacts[action] ?? { unknown: 0 };
    const riskScore = impact["risk_score"] ?? impact["consensus_impact"] ?? 1;

    return {
      action,
      predictedImpact: impact,
      safe:            (riskScore as number) < 30,
    };
  }
}

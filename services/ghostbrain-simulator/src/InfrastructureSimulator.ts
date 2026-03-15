/**
 * InfrastructureSimulator — models node failures, RPC load, and network health.
 */
export interface NodeFailureResult {
  affectedNodes:     number;
  predictedDowntime: number;     // seconds
  consensusAffected: boolean;
  cascadeRisk:       "LOW" | "MEDIUM" | "HIGH";
}

export interface RPCLoadResult {
  predictedLatencyMs: number;
  throughputRps:      number;
  queueDepth:         number;
  recommendation:     string;
}

export class InfrastructureSimulator {
  simulateNodeFailure(totalNodes: number, failedNodes: number): NodeFailureResult {
    const ratio = failedNodes / totalNodes;

    return {
      affectedNodes:     failedNodes,
      predictedDowntime: failedNodes * 12,             // ~12s per node restart
      consensusAffected: ratio > 1/3,
      cascadeRisk:       ratio > 0.5 ? "HIGH" : ratio > 0.25 ? "MEDIUM" : "LOW",
    };
  }

  simulateRPCLoad(rps: number): RPCLoadResult {
    const latency = rps * 0.002;
    return {
      predictedLatencyMs: latency,
      throughputRps:      rps,
      queueDepth:         Math.floor(rps * 0.01),
      recommendation:     latency > 100 ? "add_rpc_nodes" : "current_capacity_sufficient",
    };
  }

  simulateDiskPressure(usedGb: number, totalGb: number): { criticalIn: string; action: string } {
    const freeGb = totalGb - usedGb;
    const daysRemaining = freeGb / 2;        // assume 2 GB/day growth
    return {
      criticalIn: `${daysRemaining.toFixed(0)} days`,
      action:     daysRemaining < 7 ? "expand_storage" : "monitor",
    };
  }
}

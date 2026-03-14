// protocolSimulator — calls GhostBrain simulation API to evaluate a proposed
// protocol change before any governance proposal is generated.
// Falls back to a conservative estimate when the simulation endpoint is offline.
import { randomUUID } from 'crypto';
import type { AnalysisResult, SimulationResult, RiskLevel } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

interface GhostbrainSimResponse {
  simulationId?: string;
  successRate?: number;          // 0–100
  estimatedImprovementPct?: number;
  proposedChange?: string;
  riskLevel?: string;
  status?: 'ok' | 'error';
  error?: string;
}

function buildProposedChange(analysis: AnalysisResult): string {
  switch (analysis.type) {
    case 'gas_optimization':
      return `Optimise gas pricing algorithm to target ${RULES.targetGasUsagePct}% utilisation (current: ${analysis.value?.toFixed(1) ?? '?'}%)`;
    case 'block_time_reduction':
      return `Adjust block interval parameters to reduce avg block time from ${analysis.value?.toFixed(0) ?? '?'}ms toward ${RULES.maxBlockTimeMs}ms`;
    case 'validator_rebalancing':
      return `Rebalance validator voting-weight distribution to reduce load delta below ${RULES.validatorBalanceThresholdPct}%`;
    case 'throughput_increase':
      return `Increase maximum block gas limit to improve transaction throughput`;
    default:
      return `Protocol optimisation: ${analysis.detail}`;
  }
}

function riskFromType(type: AnalysisResult['type']): RiskLevel {
  if (type === 'validator_rebalancing' || type === 'block_time_reduction') return 'medium';
  if (type === 'throughput_increase') return 'high';
  return 'low';
}

export async function runSimulation(analysis: AnalysisResult): Promise<SimulationResult> {
  const simulationId = randomUUID();
  const proposedChange = buildProposedChange(analysis);

  let ghostbrainSim: GhostbrainSimResponse | null = null;
  try {
    const resp = await fetch(`${RULES.ghostbrainUrl}/simulation/protocol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulationId,
        analysisType: analysis.type,
        metricValue: analysis.value,
        proposedChange,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.ok) {
      ghostbrainSim = await resp.json() as GhostbrainSimResponse;
    }
  } catch {
    /* GhostBrain simulation endpoint unavailable — use conservative estimate below */
  }

  if (ghostbrainSim?.status === 'ok' && ghostbrainSim.successRate !== undefined) {
    const riskRaw = ghostbrainSim.riskLevel ?? riskFromType(analysis.type);
    const risk: RiskLevel = (riskRaw === 'high' || riskRaw === 'medium' || riskRaw === 'low')
      ? riskRaw : riskFromType(analysis.type);

    return {
      success: ghostbrainSim.successRate >= RULES.simulationMinSuccessPct,
      successRate: ghostbrainSim.successRate,
      proposedChange: ghostbrainSim.proposedChange ?? proposedChange,
      estimatedImprovementPct: ghostbrainSim.estimatedImprovementPct ?? 10,
      riskLevel: risk,
      analysis,
      simulationId: ghostbrainSim.simulationId ?? simulationId,
    };
  }

  // Conservative offline estimate — only proceed for low-risk improvements
  const risk = riskFromType(analysis.type);
  const conservativeSuccessRate = risk === 'low' ? 88 : 0;

  return {
    success: conservativeSuccessRate >= RULES.simulationMinSuccessPct,
    successRate: conservativeSuccessRate,
    proposedChange,
    estimatedImprovementPct: 10,
    riskLevel: risk,
    analysis,
    simulationId,
  };
}

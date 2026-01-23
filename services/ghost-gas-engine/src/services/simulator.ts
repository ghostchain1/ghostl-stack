import type { ChainConfig, GasPolicy } from '../config.js';
import type { GhostRpc, TxRequest } from '../rpc/ghost-rpc.js';
import { recommendedGasLimit } from '../policies/policy.js';

export type SimulationResult = {
  estimatedGas: bigint;
  recommendedGasLimit: bigint;
  blockGasLimit: bigint;
  blockGasUsed: bigint;
  marginPercent: number;
  likelyFailureReason: string | null;
  rpcNamespace: string;
};

export const simulateTx = async (
  chain: ChainConfig,
  policy: GasPolicy,
  tx: TxRequest,
  rpc: GhostRpc
): Promise<SimulationResult> => {
  let failureReason: string | null = null;
  try {
    await rpc.call(tx);
  } catch (err) {
    failureReason = err instanceof Error ? err.message : 'simulation_reverted';
  }

  const estimateHex = await rpc.estimateGas(tx);
  const estimate = BigInt(estimateHex);
  const block = await rpc.getBlockByNumber('latest');
  const blockGasLimit = block?.gasLimit ? BigInt(block.gasLimit) : BigInt(policy.maxGasLimit);
  const blockGasUsed = block?.gasUsed ? BigInt(block.gasUsed) : BigInt(0);
  const recommended = recommendedGasLimit(estimate, policy);

  const margin = Number(((recommended - estimate) * BigInt(10000)) / estimate) / 100;

  return {
    estimatedGas: estimate,
    recommendedGasLimit: recommended,
    blockGasLimit,
    blockGasUsed,
    marginPercent: Number.isFinite(margin) ? margin : policy.safetyMarginPercent,
    likelyFailureReason: failureReason,
    rpcNamespace: rpc.getNamespace()
  };
};

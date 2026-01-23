import type { ChainConfig } from '../config.js';
import type { GhostRpc } from '../rpc/ghost-rpc.js';
import { recordAiEvent, recordObservation } from './store.js';
import { toBigInt, toIsoTimeFromSeconds, toNumber } from './utils.js';

export const observeChain = async (chain: ChainConfig, rpc: GhostRpc) => {
  const start = Date.now();
  let block: any = null;
  let success = true;
  let errorMessage: string | null = null;

  try {
    block = await rpc.getBlockByNumber('latest');
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : 'rpc_error';
  }

  const latency = Date.now() - start;
  const blockNumber = toBigInt(block?.number);
  const gasLimit = toBigInt(block?.gasLimit);
  const gasUsed = toBigInt(block?.gasUsed);
  const baseFee = toBigInt(block?.baseFeePerGas);
  const blockTime = toIsoTimeFromSeconds(toBigInt(block?.timestamp));

  const inserted = await recordObservation({
    chainKey: chain.key,
    blockNumber: toNumber(blockNumber),
    gasLimit: toNumber(gasLimit),
    gasUsed: toNumber(gasUsed),
    baseFee: toNumber(baseFee),
    blockTime,
    rpcLatencyMs: latency,
    rpcNamespace: rpc.getNamespace(),
    success,
    errorMessage
  });

  await recordAiEvent(chain.key, 'observe', success ? 'block_sampled' : 'block_error', {
    observationId: inserted.id,
    latencyMs: latency,
    success,
    errorMessage
  });

  return {
    observationId: inserted.id,
    success,
    gasLimit: toNumber(gasLimit),
    gasUsed: toNumber(gasUsed),
    rpcNamespace: rpc.getNamespace()
  };
};

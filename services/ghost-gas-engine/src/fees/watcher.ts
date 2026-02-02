/* eslint-disable no-console */
import { config, loadChains, type ChainConfig } from '../config.js';
import { query } from '../db/index.js';
import { createGhostRpc } from '../rpc/ghost-rpc.js';
import { generateRecommendation, loadFeePolicy } from './recommendations.js';

const BPS_DENOMINATOR = 10_000;

const hexToBigInt = (value: unknown): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.max(0, Math.trunc(value)));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return value.startsWith('0x') ? BigInt(value) : BigInt(Math.trunc(Number(value)));
    } catch {
      return 0n;
    }
  }
  return 0n;
};

const bigintToNumber = (value: bigint): number => {
  if (value <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > maxSafe ? maxSafe : value);
};

const computeGasUsedRatio = (gasUsed: bigint, gasLimit: bigint): number => {
  if (gasLimit <= 0n) return 0;
  const ratio = Number(gasUsed) / Number(gasLimit);
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
};

const loadPreviousBaseFee = async (chainKey: string): Promise<number | null> => {
  const rows = await query<{ base_fee: string | null }>(
    `SELECT base_fee
     FROM gas_fee_samples
     WHERE chain_key = $1
     ORDER BY observed_at DESC
     LIMIT 1`,
    [chainKey]
  );
  const value = rows[0]?.base_fee;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const detectViolationReason = (baseFee: number, priorityFee: number, prevBaseFee: number | null, policy: Awaited<ReturnType<typeof loadFeePolicy>>) => {
  if (baseFee > policy.maxBaseFee) return 1;
  if (priorityFee > policy.maxPriorityFee) return 2;
  if (prevBaseFee && prevBaseFee > 0) {
    const maxAllowed = (prevBaseFee * (BPS_DENOMINATOR + policy.spikeThresholdBps)) / BPS_DENOMINATOR;
    if (baseFee > maxAllowed) return 3;
  }
  return 0;
};

const computeSlashAmount = (policy: Awaited<ReturnType<typeof loadFeePolicy>>): number => {
  const penalty = (policy.minBond * policy.violationPenaltyBps) / BPS_DENOMINATOR;
  if (!Number.isFinite(penalty) || penalty <= 0) return policy.minBond;
  return Math.max(penalty, policy.minBond);
};

async function recordSample(chain: ChainConfig) {
  const prevBaseFee = await loadPreviousBaseFee(chain.key);
  const rpc = await createGhostRpc(chain.rpcUrl);
  const [block, feeData, policy] = await Promise.all([rpc.getBlockByNumber('latest'), rpc.getFeeData(), loadFeePolicy(chain.key)]);

  const baseFeePerGas = hexToBigInt(block?.baseFeePerGas);
  const gasUsed = hexToBigInt(block?.gasUsed);
  const gasLimit = hexToBigInt(block?.gasLimit);
  const blockNumber = bigintToNumber(hexToBigInt(block?.number));
  const gasUsedRatio = computeGasUsedRatio(gasUsed, gasLimit);

  let priorityFee = feeData.maxPriorityFeePerGas ?? 0n;
  if (priorityFee === 0n && feeData.gasPrice && baseFeePerGas > 0n && feeData.gasPrice > baseFeePerGas) {
    priorityFee = feeData.gasPrice - baseFeePerGas;
  }

  const baseFee = bigintToNumber(baseFeePerGas);
  const priorityFeeNumber = bigintToNumber(priorityFee);

  await query(
    `INSERT INTO gas_fee_samples
       (chain_key, block_number, base_fee, priority_fee, gas_used_ratio, observed_at, source, raw)
     VALUES ($1,$2,$3,$4,$5,now(),$6,$7)`,
    [
      chain.key,
      blockNumber || null,
      baseFee || null,
      priorityFeeNumber || null,
      gasUsedRatio,
      'fee-watcher',
      JSON.stringify({ block, feeData, rpcNamespace: rpc.getNamespace() })
    ]
  );

  const reasonCode = detectViolationReason(baseFee, priorityFeeNumber, prevBaseFee, policy);
  if (reasonCode !== 0) {
    const slashAmount = computeSlashAmount(policy);
    const evidence = {
      chainId: chain.chainId,
      blockStart: blockNumber,
      blockEnd: blockNumber,
      observedBaseFee: baseFee,
      observedPriorityFee: priorityFeeNumber,
      prevBaseFee,
      logsHash: block?.hash ?? null,
      attestor: 'fee-watcher',
      safeMode: config.FEE_WATCHER_SAFE_MODE
    };
    await query(
      `INSERT INTO gas_slashing_events
         (chain_key, operator, violation_id, reason_code, slash_amount, status, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        chain.key,
        `${chain.key}-sequencer`,
        blockNumber || null,
        reasonCode,
        slashAmount,
        config.FEE_WATCHER_SAFE_MODE ? 'reported' : 'ready',
        JSON.stringify(evidence)
      ]
    );
  }

  await generateRecommendation(chain.key, config.FEE_WATCHER_WINDOW_SIZE);
}

let loopStarted = false;
let inFlight = false;

export function startFeeWatcherLoop(): void {
  if (loopStarted) return;
  loopStarted = true;

  if (!config.FEE_WATCHER_ENABLED) {
    console.log('[fee-watcher] disabled');
    return;
  }

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const chains = loadChains();
      for (const chain of chains) {
        try {
          await recordSample(chain);
        } catch (err) {
          console.warn(`[fee-watcher] failed for ${chain.key}`, err);
        }
      }
    } finally {
      inFlight = false;
    }
  };

  // Run immediately, then continue on the configured interval.
  void tick();
  const intervalMs = Math.max(5, config.FEE_WATCHER_INTERVAL_SECONDS) * 1000;
  setInterval(() => void tick(), intervalMs);
  console.log(`[fee-watcher] running every ${intervalMs / 1000}s`);
}


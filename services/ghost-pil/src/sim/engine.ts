import { pool } from '../db/index.js';

export type SimulationParams = {
  gasLimitDelta?: number;
  feeDelta?: number;
  note?: string;
};

export type SimulationInput = {
  chainId: number;
  horizon: string;
  params: SimulationParams;
};

export type SimulationResult = {
  throughput: number | null;
  predictedFees: number | null;
  predictedRevertRate: number | null;
  predictedOogRate: number | null;
  confidence: number;
  resultsJson: Record<string, unknown>;
};

const parseHorizonMs = (value: string): number => {
  const match = value.trim().match(/^([0-9]+)(s|m|h|d)$/i);
  if (!match) return 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const runSimulation = async ({ chainId, horizon, params }: SimulationInput): Promise<SimulationResult> => {
  const horizonMs = parseHorizonMs(horizon);
  const cutoff = new Date(Date.now() - horizonMs);

  const blockStats = await pool.query<{
    blocks: string;
    txs: string;
    avg_gas_limit: string | null;
    avg_gas_used: string | null;
    start_ts: Date | null;
    end_ts: Date | null;
  }>(
    `SELECT COUNT(*)::text AS blocks,
            COALESCE(SUM(tx_count),0)::text AS txs,
            AVG(gas_limit) AS avg_gas_limit,
            AVG(gas_used) AS avg_gas_used,
            MIN(timestamp) AS start_ts,
            MAX(timestamp) AS end_ts
     FROM pil_blocks
     WHERE chain_id = $1 AND timestamp >= $2`,
    [chainId, cutoff]
  );

  const blocks = Number(blockStats.rows[0]?.blocks || 0);
  const txs = Number(blockStats.rows[0]?.txs || 0);
  const avgGasLimit = blockStats.rows[0]?.avg_gas_limit ? Number(blockStats.rows[0].avg_gas_limit) : null;
  const avgGasUsed = blockStats.rows[0]?.avg_gas_used ? Number(blockStats.rows[0].avg_gas_used) : null;

  const startTs = blockStats.rows[0]?.start_ts ? new Date(blockStats.rows[0].start_ts).getTime() : null;
  const endTs = blockStats.rows[0]?.end_ts ? new Date(blockStats.rows[0].end_ts).getTime() : null;
  const elapsedSeconds = startTs && endTs && endTs > startTs ? (endTs - startTs) / 1000 : 0;

  const throughput = elapsedSeconds > 0 ? txs / elapsedSeconds : txs > 0 ? txs : 0;

  const gasStats = await pool.query<{
    avg_gas_price: string | null;
    txs: string;
  }>(
    `SELECT AVG(COALESCE(max_fee_per_gas, gas_price)) AS avg_gas_price,
            COUNT(*)::text AS txs
     FROM pil_txs t
     JOIN pil_blocks b ON b.chain_id = t.chain_id AND b.number = t.block_number
     WHERE t.chain_id = $1 AND b.timestamp >= $2`,
    [chainId, cutoff]
  );

  const avgGasPrice = gasStats.rows[0]?.avg_gas_price ? Number(gasStats.rows[0].avg_gas_price) : null;

  const receiptStats = await pool.query<{
    failed: string;
    total: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE status = 0)::text AS failed,
            COUNT(*) FILTER (WHERE status IS NOT NULL)::text AS total
     FROM pil_receipts r
     JOIN pil_txs t ON t.chain_id = r.chain_id AND t.hash = r.tx_hash
     JOIN pil_blocks b ON b.chain_id = t.chain_id AND b.number = t.block_number
     WHERE r.chain_id = $1 AND b.timestamp >= $2`,
    [chainId, cutoff]
  );

  const totalReceipts = Number(receiptStats.rows[0]?.total || 0);
  const failedReceipts = Number(receiptStats.rows[0]?.failed || 0);
  const predictedRevertRate = totalReceipts > 0 ? failedReceipts / totalReceipts : null;

  const oogStats = await pool.query<{
    oog: string;
    total: string;
  }>(
    `SELECT COUNT(*) FILTER (WHERE r.status = 0 AND r.gas_used >= (t.gas_limit * 0.98))::text AS oog,
            COUNT(*) FILTER (WHERE r.status IS NOT NULL)::text AS total
     FROM pil_receipts r
     JOIN pil_txs t ON t.chain_id = r.chain_id AND t.hash = r.tx_hash
     JOIN pil_blocks b ON b.chain_id = t.chain_id AND b.number = t.block_number
     WHERE r.chain_id = $1 AND b.timestamp >= $2`,
    [chainId, cutoff]
  );

  const totalOog = Number(oogStats.rows[0]?.total || 0);
  const oogCount = Number(oogStats.rows[0]?.oog || 0);
  const predictedOogRate = totalOog > 0 ? oogCount / totalOog : null;

  const feeDelta = params.feeDelta ?? 0;
  const gasLimitDelta = params.gasLimitDelta ?? 0;

  const predictedFees = avgGasUsed !== null && avgGasPrice !== null
    ? avgGasUsed * avgGasPrice * (1 + feeDelta)
    : null;

  const adjustedThroughput = throughput * (1 + gasLimitDelta);

  const confidenceBase = txs > 0 ? 0.55 + Math.log10(txs + 1) / 6 : 0.3;
  const confidence = clamp(confidenceBase, 0.3, 0.95);

  return {
    throughput: Number.isFinite(adjustedThroughput) ? adjustedThroughput : null,
    predictedFees,
    predictedRevertRate,
    predictedOogRate,
    confidence,
    resultsJson: {
      blocksAnalyzed: blocks,
      txsAnalyzed: txs,
      horizon,
      avgGasLimit,
      avgGasUsed,
      avgGasPrice,
      elapsedSeconds,
      paramsApplied: {
        gasLimitDelta,
        feeDelta,
        note: params.note || null
      }
    }
  };
};

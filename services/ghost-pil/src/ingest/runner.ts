import { config, loadChains, type ChainConfig } from '../config.js';
import { createGhostRpc } from '../rpc/ghost-rpc.js';
import { pool } from '../db/index.js';
import {
  ingestTicks,
  rpcErrors,
  blocksIngested,
  txsIngested,
  receiptsIngested,
  tracesIngested,
  chainHead
} from '../telemetry/metrics.js';

const hexToBigIntString = (value?: string | null) => {
  if (!value) return null;
  try {
    return BigInt(value).toString();
  } catch {
    return null;
  }
};

const hexToNumber = (value?: string | null) => {
  if (!value) return null;
  try {
    return Number(BigInt(value));
  } catch {
    return null;
  }
};

const toTimestamp = (hex?: string | null) => {
  const seconds = hexToNumber(hex);
  if (seconds === null) return new Date(0);
  return new Date(seconds * 1000);
};

const ensureChain = async (chain: ChainConfig) => {
  await pool.query(
    `INSERT INTO pil_chains (chain_id, chain_key, name, type, gas_token_symbol, rpc_url_ref)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (chain_id) DO UPDATE
     SET chain_key = EXCLUDED.chain_key,
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         gas_token_symbol = EXCLUDED.gas_token_symbol,
         rpc_url_ref = EXCLUDED.rpc_url_ref,
         updated_at = NOW()` ,
    [chain.chainId, chain.key, chain.name, chain.type, chain.gasTokenSymbol, chain.rpcUrl]
  );
};

const getChainState = async (chainId: number) => {
  const result = await pool.query<{
    last_block_number: string | null;
    last_block_hash: string | null;
  }>('SELECT last_block_number, last_block_hash FROM pil_chain_state WHERE chain_id = $1', [chainId]);
  return result.rows[0] || null;
};

const updateChainState = async (chainId: number, blockNumber: string | null, blockHash: string | null) => {
  await pool.query(
    `INSERT INTO pil_chain_state (chain_id, last_block_number, last_block_hash, last_ingested_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (chain_id) DO UPDATE
     SET last_block_number = EXCLUDED.last_block_number,
         last_block_hash = EXCLUDED.last_block_hash,
         last_ingested_at = NOW(),
         last_error = NULL,
         updated_at = NOW()` ,
    [chainId, blockNumber, blockHash]
  );
};

const updateChainError = async (chainId: number, errorMessage: string) => {
  await pool.query(
    `INSERT INTO pil_chain_state (chain_id, last_error, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chain_id) DO UPDATE
     SET last_error = EXCLUDED.last_error,
         updated_at = NOW()` ,
    [chainId, errorMessage]
  );
};

const recordRpcHealth = async (chainId: number, endpoint: string, latencyMs: number, ok: boolean, errorMessage?: string) => {
  await pool.query(
    `INSERT INTO pil_rpc_health (chain_id, endpoint, latency_ms, error_rate, last_ok_at, last_error_at, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)` ,
    [
      chainId,
      endpoint,
      latencyMs,
      ok ? 0 : 1,
      ok ? new Date() : null,
      ok ? null : new Date(),
      ok ? null : errorMessage || null
    ]
  );
};

const ingestBlock = async (chain: ChainConfig, block: any) => {
  const number = hexToBigIntString(block.number);
  const gasLimit = hexToBigIntString(block.gasLimit);
  const gasUsed = hexToBigIntString(block.gasUsed);
  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  await pool.query(
    `INSERT INTO pil_blocks (chain_id, number, hash, parent_hash, timestamp, gas_limit, gas_used, tx_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (chain_id, number) DO UPDATE
     SET hash = EXCLUDED.hash,
         parent_hash = EXCLUDED.parent_hash,
         timestamp = EXCLUDED.timestamp,
         gas_limit = EXCLUDED.gas_limit,
         gas_used = EXCLUDED.gas_used,
         tx_count = EXCLUDED.tx_count` ,
    [chain.chainId, number, block.hash, block.parentHash, toTimestamp(block.timestamp), gasLimit, gasUsed, txs.length]
  );
  blocksIngested.labels(chain.key).inc();

  for (const tx of txs) {
    const gasLimitTx = hexToBigIntString(tx.gas);
    const gasPrice = hexToBigIntString(tx.gasPrice);
    const maxFeePerGas = hexToBigIntString(tx.maxFeePerGas);
    const maxPriorityFeePerGas = hexToBigIntString(tx.maxPriorityFeePerGas);
    const value = hexToBigIntString(tx.value);
    const nonce = hexToBigIntString(tx.nonce);
    await pool.query(
      `INSERT INTO pil_txs (chain_id, hash, block_number, from_addr, to_addr, nonce, gas_limit, gas_price, max_fee_per_gas, max_priority_fee_per_gas, value, input_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (chain_id, hash) DO UPDATE
       SET block_number = EXCLUDED.block_number,
           from_addr = EXCLUDED.from_addr,
           to_addr = EXCLUDED.to_addr,
           nonce = EXCLUDED.nonce,
           gas_limit = EXCLUDED.gas_limit,
           gas_price = EXCLUDED.gas_price,
           max_fee_per_gas = EXCLUDED.max_fee_per_gas,
           max_priority_fee_per_gas = EXCLUDED.max_priority_fee_per_gas,
           value = EXCLUDED.value,
           input_size = EXCLUDED.input_size,
           status = EXCLUDED.status` ,
      [
        chain.chainId,
        tx.hash,
        number,
        tx.from,
        tx.to,
        nonce,
        gasLimitTx,
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas,
        value,
        tx.input ? Math.max(tx.input.length - 2, 0) / 2 : 0,
        tx.status || null
      ]
    );
    txsIngested.labels(chain.key).inc();
  }
};

const ingestReceipts = async (chain: ChainConfig, rpc: Awaited<ReturnType<typeof createGhostRpc>>, txs: any[]) => {
  if (!config.PIL_RECEIPTS_ENABLED) return;
  for (const tx of txs) {
    const receipt = await rpc.getTransactionReceipt(tx.hash).catch((err) => {
      rpcErrors.labels(chain.key, 'getTransactionReceipt').inc();
      return null;
    });
    if (!receipt) continue;
    await pool.query(
      `INSERT INTO pil_receipts (chain_id, tx_hash, status, gas_used, cumulative_gas_used, effective_gas_price, contract_address, logs_bloom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (chain_id, tx_hash) DO UPDATE
       SET status = EXCLUDED.status,
           gas_used = EXCLUDED.gas_used,
           cumulative_gas_used = EXCLUDED.cumulative_gas_used,
           effective_gas_price = EXCLUDED.effective_gas_price,
           contract_address = EXCLUDED.contract_address,
           logs_bloom = EXCLUDED.logs_bloom` ,
      [
        chain.chainId,
        tx.hash,
        receipt.status ? parseInt(receipt.status, 16) : null,
        hexToBigIntString(receipt.gasUsed),
        hexToBigIntString(receipt.cumulativeGasUsed),
        hexToBigIntString(receipt.effectiveGasPrice),
        receipt.contractAddress || null,
        receipt.logsBloom || null
      ]
    );
    receiptsIngested.labels(chain.key).inc();
  }
};

const ingestTraces = async (chain: ChainConfig, rpc: Awaited<ReturnType<typeof createGhostRpc>>, txs: any[]) => {
  if (!config.PIL_TRACE_ENABLED) return;
  for (const tx of txs) {
    const trace = await rpc.traceTransaction(tx.hash).catch((err) => {
      rpcErrors.labels(chain.key, 'traceTransaction').inc();
      return null;
    });
    if (!trace) continue;
    await pool.query(
      `INSERT INTO pil_traces (chain_id, tx_hash, trace_available, trace_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chain_id, tx_hash) DO UPDATE
       SET trace_available = EXCLUDED.trace_available,
           trace_json = EXCLUDED.trace_json` ,
      [chain.chainId, tx.hash, true, JSON.stringify(trace)]
    );
    tracesIngested.labels(chain.key).inc();
  }
};

export const runIngestTick = async () => {
  ingestTicks.inc();
  const chains = await loadChains();
  for (const chain of chains) {
    await ensureChain(chain);
    const rpc = await createGhostRpc({ rpcUrl: chain.rpcUrl, chainId: chain.chainId, chainKey: chain.key });

    const start = Date.now();
    let latestHex: string;
    try {
      latestHex = await rpc.blockNumber();
      const latency = Date.now() - start;
      await recordRpcHealth(chain.chainId, chain.rpcUrl, latency, true);
    } catch (err) {
      const latency = Date.now() - start;
      await recordRpcHealth(chain.chainId, chain.rpcUrl, latency, false, (err as Error).message);
      await updateChainError(chain.chainId, (err as Error).message);
      rpcErrors.labels(chain.key, 'blockNumber').inc();
      continue;
    }

    const latest = hexToBigIntString(latestHex);
    if (!latest) continue;
    chainHead.labels(chain.key).set(Number(latest));

    const state = await getChainState(chain.chainId);
    const latestNum = BigInt(latest);
    const maxBlocks = BigInt(config.PIL_MAX_BLOCKS_PER_TICK);
    const defaultStart = latestNum > maxBlocks ? latestNum - maxBlocks + 1n : 0n;
    const lastSeen = state?.last_block_number ? BigInt(state.last_block_number) : null;
    let cursor = lastSeen ? lastSeen + 1n : defaultStart;

  for (let count = 0n; cursor <= latestNum && count < maxBlocks; cursor++, count++) {
    const block = await rpc.getBlockByNumber(`0x${cursor.toString(16)}`, true).catch((err) => {
      rpcErrors.labels(chain.key, 'getBlockByNumber').inc();
      return null;
    });
    if (!block) break;
    await ingestBlock(chain, block);
    const txs = Array.isArray(block.transactions) ? block.transactions : [];
    await ingestReceipts(chain, rpc, txs);
    await ingestTraces(chain, rpc, txs);
    await updateChainState(chain.chainId, cursor.toString(), block.hash || null);
  }
  }
};

export const startIngestLoop = () => {
  if (!config.PIL_INGEST_ENABLED) return;
  runIngestTick().catch(() => undefined);
  setInterval(() => runIngestTick().catch(() => undefined), config.PIL_INGEST_INTERVAL_SECONDS * 1000);
};

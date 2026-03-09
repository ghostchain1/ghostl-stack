/**
 * Network Analyzer
 *
 * Coordinates all sub-analyzers (validator, treasury, defi) and combines
 * them with per-chain RPC metrics (gas price, block number, block time)
 * into a unified NetworkState snapshot.
 *
 * All cross-chain traffic is routed through GhostChain L1 per architecture.
 * L2 and L3 are queried directly only for metrics — no external chain reads.
 */
import type { ChainMetrics, NetworkState } from "../types.js";
import { analyzeValidators } from "./validator-analyzer.js";
import { analyzeTreasury }   from "./treasury-analyzer.js";
import { analyzeDefi }       from "./defi-analyzer.js";

const L1_RPC  = process.env.GHOSTCHAIN_L1_RPC ?? "http://127.0.0.1:18545";
const L2_RPC  = process.env.GHOSTCHAIN_L2_RPC ?? "http://127.0.0.1:29545";
const L3_RPC  = process.env.GHOSTCHAIN_L3_RPC ?? "http://127.0.0.1:39545";

const CHAIN_IDS = { L1: 14_000_101, L2: 901, L3: 903 } as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rpcCall(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const resp = await fetch(url, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(5_000),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC[${url}] ${method}: ${json.error.message}`);
  return json.result;
}

async function getChainMetrics(rpc: string, chainId: number): Promise<ChainMetrics> {
  try {
    const [gasPriceHex, blockNumberHex] = await Promise.all([
      rpcCall(rpc, "ghost_gasPrice"),
      rpcCall(rpc, "ghost_blockNumber"),
    ]);

    const gasPrice    = BigInt(gasPriceHex as string);
    const blockNumber = BigInt(blockNumberHex as string);

    // Estimate block time from consecutive block timestamps
    let blockTime = 2;
    try {
      const [latest, prev] = await Promise.all([
        rpcCall(rpc, "ghost_getBlockByNumber", ["latest", false]),
        rpcCall(rpc, "ghost_getBlockByNumber", [
          "0x" + (blockNumber - 1n).toString(16), false,
        ]),
      ]);
      const t1 = Number(BigInt((latest as { timestamp: string }).timestamp));
      const t0 = Number(BigInt((prev   as { timestamp: string }).timestamp));
      if (t1 > t0) blockTime = t1 - t0;
    } catch { /* use default 2 s */ }

    // Tx rate from latest block transaction count
    let txRatePerMin = 0;
    try {
      const block = await rpcCall(rpc, "ghost_getBlockByNumber", ["latest", true]) as {
        transactions: unknown[];
      };
      txRatePerMin = blockTime > 0
        ? Math.round((block.transactions.length / blockTime) * 60)
        : 0;
    } catch { /* use default */ }

    return { chainId, rpc, gasPrice, blockNumber, blockTime, txRatePerMin, reachable: true };
  } catch {
    return { chainId, rpc, gasPrice: 0n, blockNumber: 0n, blockTime: 0, txRatePerMin: 0, reachable: false };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function analyzeNetwork(): Promise<NetworkState> {
  const [l1, l2, l3, validators, treasury, defiAnalysis] = await Promise.all([
    getChainMetrics(L1_RPC, CHAIN_IDS.L1),
    getChainMetrics(L2_RPC, CHAIN_IDS.L2),
    getChainMetrics(L3_RPC, CHAIN_IDS.L3),
    analyzeValidators(),
    analyzeTreasury(),
    analyzeDefi(),
  ]);

  return {
    timestamp:  Date.now(),
    l1,
    l2,
    l3,
    validators,
    liquidity:  defiAnalysis.liquidity,
    treasury,
    defi:       defiAnalysis.defi,
  };
}

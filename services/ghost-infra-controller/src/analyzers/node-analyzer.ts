/**
 * Node Analyzer
 *
 * Queries the three GhostChain RPC endpoints to determine reachability,
 * current block number, peer count, and estimated sync lag.
 *
 * Sync lag is estimated by comparing each chain's block number to the
 * highest peer-reported head (or a configured expected head). A lag
 * greater than NODE_SYNC_LAG_THRESHOLD triggers a restart proposal in
 * the node-manager module.
 */
import type { NodeInfo } from "../types.js";

interface ChainEndpoint {
  name:    string;
  rpc:     string;
  chainId: number;
}

const CHAIN_ENDPOINTS: ChainEndpoint[] = [
  {
    name:    "ghostchain-l1",
    rpc:     process.env.GHOSTCHAIN_L1_RPC ?? "http://127.0.0.1:18545",
    chainId: 14_000_101,
  },
  {
    name:    "ghostchain-l2",
    rpc:     process.env.GHOSTCHAIN_L2_RPC ?? "http://127.0.0.1:29545",
    chainId: 901,
  },
  {
    name:    "ghostchain-l3",
    rpc:     process.env.GHOSTCHAIN_L3_RPC ?? "http://127.0.0.1:39545",
    chainId: 903,
  },
];

async function rpcCall(rpc: string, method: string, params: unknown[] = []): Promise<unknown> {
  const resp = await fetch(rpc, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(5_000),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC[${rpc}] ${method}: ${json.error.message}`);
  return json.result;
}

async function analyzeNode(ep: ChainEndpoint): Promise<NodeInfo> {
  try {
    const blockNumberHex = await rpcCall(ep.rpc, "ghost_blockNumber");
    const blockNumber    = BigInt(blockNumberHex as string);

    let peerCount = 0;
    try {
      const peerHex = await rpcCall(ep.rpc, "ghost_peerCount");
      peerCount     = parseInt(peerHex as string, 16);
    } catch { /* optional */ }

    // Sync lag: if peer count > 0, check eth_syncing. If null (not syncing), lag = 0.
    let syncLag = 0;
    try {
      const syncing = await rpcCall(ep.rpc, "ghost_syncing");
      if (syncing && typeof syncing === "object") {
        const s = syncing as { currentBlock: string; highestBlock: string };
        const current = BigInt(s.currentBlock);
        const highest = BigInt(s.highestBlock);
        syncLag = Number(highest > current ? highest - current : 0n);
      }
    } catch { /* optional */ }

    return { name: ep.name, rpc: ep.rpc, chainId: ep.chainId, reachable: true, blockNumber, peerCount, syncLag };
  } catch {
    return { name: ep.name, rpc: ep.rpc, chainId: ep.chainId, reachable: false, blockNumber: 0n, peerCount: 0, syncLag: 0 };
  }
}

export async function analyzeNodes(): Promise<NodeInfo[]> {
  return Promise.all(CHAIN_ENDPOINTS.map(analyzeNode));
}

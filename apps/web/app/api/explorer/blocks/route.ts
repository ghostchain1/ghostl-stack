/**
 * /api/explorer/blocks — Fetch recent blocks from L1 / L2 / L3.
 *
 * Query params:
 *   chain  = l1 | l2 | l3   (default: l1)
 *   count  = 1–50            (default: 20)
 *
 * First tries the GhostScan API (via the existing catch-all proxy) when
 * GHOSTSCOUT_*_INTERNAL is configured; falls back to direct JSON-RPC
 * eth_getBlockByNumber calls so the explorer always shows data.
 *
 * Env vars:
 *   GHOSTSCOUT_L1_INTERNAL, GHOSTSCOUT_L2_INTERNAL, GHOSTSCOUT_L3_INTERNAL
 *   L1_RPC_URL (default :18545), L2_RPC_URL (default :29547), L3_RPC_URL (default :39545)
 */

import { type NextRequest, NextResponse } from 'next/server';

const RPC: Record<string, string> = {
  l1: process.env.L1_RPC_URL ?? 'http://localhost:18545',
  l2: process.env.L2_RPC_URL ?? 'http://localhost:29547',
  l3: process.env.L3_RPC_URL ?? 'http://localhost:39545',
};

const GHOSTSCAN: Record<string, string | undefined> = {
  l1: process.env.GHOSTSCOUT_L1_INTERNAL,
  l2: process.env.GHOSTSCOUT_L2_INTERNAL,
  l3: process.env.GHOSTSCOUT_L3_INTERNAL,
};

const CHAIN_NAMES: Record<string, string> = {
  l1: 'GhostChain',
  l2: 'GhostL2',
  l3: 'GhostL3',
};

const CHAIN_IDS: Record<string, string> = {
  l1: '14000101',
  l2: '901',
  l3: '903',
};

interface BlockResult {
  number:    number;
  hash:      string;
  timestamp: number;
  txCount:   number;
  gasUsed:   string;
  gasLimit:  string;
  miner:     string;
  size:      number;
  chain:     string;
  chainId:   string;
}

async function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (json.result === undefined) throw new Error('RPC returned no result');
  return json.result;
}

interface RpcBlock {
  number:           string;
  hash:             string;
  timestamp:        string;
  transactions:     unknown[];
  gasUsed:          string;
  gasLimit:         string;
  miner:            string;
  size:             string;
}

async function fetchBlocksViaRpc(chain: string, count: number): Promise<BlockResult[]> {
  const rpcUrl = RPC[chain];
  if (!rpcUrl) throw new Error(`no RPC URL for chain ${chain}`);

  const latestHex = await rpcCall<string>(rpcUrl, 'ghost_blockNumber', []);
  const latest    = parseInt(latestHex, 16);

  const batchSize = Math.min(count, 50);
  const blockNums = Array.from({ length: batchSize }, (_, i) => Math.max(0, latest - i));

  const blocks = await Promise.all(
    blockNums.map(n =>
      rpcCall<RpcBlock>(rpcUrl, 'ghost_getBlockByNumber', [`0x${n.toString(16)}`, false])
        .catch(() => null),
    ),
  );

  return blocks
    .filter((b): b is RpcBlock => b !== null)
    .map(b => ({
      number:    parseInt(b.number, 16),
      hash:      b.hash,
      timestamp: parseInt(b.timestamp, 16),
      txCount:   b.transactions.length,
      gasUsed:   (parseInt(b.gasUsed, 16) / 1e9).toFixed(4) + ' Gwei',
      gasLimit:  b.gasLimit,
      miner:     b.miner,
      size:      parseInt(b.size ?? '0x0', 16),
      chain:     CHAIN_NAMES[chain] ?? chain,
      chainId:   CHAIN_IDS[chain] ?? '0',
    }));
}

async function fetchBlocksViaGhostScan(scanBase: string, chain: string, count: number): Promise<BlockResult[]> {
  const res = await fetch(`${scanBase}/api/v2/blocks?limit=${count}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`GhostScan HTTP ${res.status}`);
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  const items = data.items ?? [];

  return items.map(b => ({
    number:    Number(b.height ?? b.number ?? 0),
    hash:      String(b.hash ?? ''),
    timestamp: Number(b.timestamp ?? 0),
    txCount:   Number(b.tx_count ?? b.txCount ?? 0),
    gasUsed:   String(b.gas_used ?? b.gasUsed ?? '0'),
    gasLimit:  String(b.gas_limit ?? b.gasLimit ?? '0'),
    miner:     String((b.miner as Record<string, unknown> | null)?.['hash'] ?? b.miner ?? ''),
    size:      Number(b.size ?? 0),
    chain:     CHAIN_NAMES[chain] ?? chain,
    chainId:   CHAIN_IDS[chain] ?? '0',
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const rawChain = searchParams.get('chain') ?? 'l1';
  const chain    = ['l1', 'l2', 'l3'].includes(rawChain) ? rawChain : 'l1';
  const count    = Math.min(Math.max(parseInt(searchParams.get('count') ?? '20', 10), 1), 50);

  let blocks: BlockResult[] = [];
  let source = 'rpc';

  const scanBase = GHOSTSCAN[chain];
  if (scanBase) {
    try {
      blocks = await fetchBlocksViaGhostScan(scanBase, chain, count);
      source = 'ghostscan';
    } catch {
      // fall through to RPC
    }
  }

  if (blocks.length === 0) {
    try {
      blocks = await fetchBlocksViaRpc(chain, count);
      source = 'rpc';
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'node unreachable', blocks: [] },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { blocks, count: blocks.length, chain, source, timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

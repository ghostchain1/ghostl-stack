/**
 * /api/network/topology — Live network topology snapshot.
 *
 * Aggregates chain head numbers, peer counts, and validator summary from
 * L1/L2/L3 RPC + GhostBrain.  Used by the 3-D topology visualiser.
 *
 * Env vars:
 *   L1_RPC_URL        default http://localhost:18545
 *   L2_RPC_URL        default http://localhost:29545
 *   L3_RPC_URL        default http://localhost:39545
 *   GHOSTBRAIN_INTERNAL  default http://localhost:7900
 */

import { NextResponse } from 'next/server';

const L1_RPC = process.env.L1_RPC_URL         ?? 'http://localhost:18545';
const L2_RPC = process.env.L2_RPC_URL         ?? 'http://localhost:29545';
const L3_RPC = process.env.L3_RPC_URL         ?? 'http://localhost:39545';
const BRAIN  = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

type ChainNode = {
  id:          string;
  label:       string;
  layer:       'l1' | 'l2' | 'l3';
  blockNumber: number | null;
  status:      'online' | 'degraded' | 'offline';
  peers:       number;
};

type Bridge = { from: string; to: string; label: string };

async function rpcBlockNumber(rpc: string): Promise<{ block: number; peers: number } | null> {
  try {
    const [blkRes, peerRes] = await Promise.all([
      fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(4_000),
      }),
      fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'net_peerCount', params: [] }),
        signal: AbortSignal.timeout(4_000),
      }),
    ]);

    if (!blkRes.ok) return null;
    const blkData = (await blkRes.json()) as { result?: string };
    const peerData = peerRes.ok ? ((await peerRes.json()) as { result?: string }) : { result: '0x0' };

    return {
      block: blkData.result ? parseInt(blkData.result, 16) : 0,
      peers: peerData.result ? parseInt(peerData.result, 16) : 0,
    };
  } catch {
    return null;
  }
}

async function getValidatorCount(): Promise<number> {
  try {
    const res = await fetch(`${BRAIN}/validators/health`, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return 0;
    const data = (await res.json()) as { validators?: unknown[]; total?: number };
    return data.total ?? (Array.isArray(data.validators) ? data.validators.length : 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const [l1, l2, l3, valCount] = await Promise.all([
    rpcBlockNumber(L1_RPC),
    rpcBlockNumber(L2_RPC),
    rpcBlockNumber(L3_RPC),
    getValidatorCount(),
  ]);

  const chainNodes: ChainNode[] = [
    {
      id:          'ghostchain-l1',
      label:       'GhostChain L1',
      layer:       'l1',
      blockNumber: l1?.block ?? null,
      status:      l1 ? 'online' : 'offline',
      peers:       l1?.peers ?? 0,
    },
    {
      id:          'ghostl2',
      label:       'GhostL2',
      layer:       'l2',
      blockNumber: l2?.block ?? null,
      status:      l2 ? 'online' : 'offline',
      peers:       l2?.peers ?? 0,
    },
    {
      id:          'ghostl3',
      label:       'GhostL3',
      layer:       'l3',
      blockNumber: l3?.block ?? null,
      status:      l3 ? 'online' : 'offline',
      peers:       l3?.peers ?? 0,
    },
  ];

  const validatorNodes: ChainNode[] = valCount > 0
    ? Array.from({ length: Math.min(valCount, 6) }, (_, i) => ({
        id:          `validator-${i + 1}`,
        label:       `Validator ${i + 1}`,
        layer:       'l1' as const,
        blockNumber: null,
        status:      'online' as const,
        peers:       0,
      }))
    : [];

  const bridges: Bridge[] = [
    { from: 'ghostchain-l1', to: 'ghostl2',      label: 'L1→L2 Rollup' },
    { from: 'ghostl2',       to: 'ghostl3',      label: 'L2→L3 Rollup' },
    { from: 'ghostchain-l1', to: 'validator-1',  label: 'Validator Set' },
  ];

  return NextResponse.json(
    { nodes: [...chainNodes, ...validatorNodes], bridges, timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

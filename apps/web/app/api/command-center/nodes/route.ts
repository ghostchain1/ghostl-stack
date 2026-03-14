import { NextResponse } from 'next/server';

const L1_RPC = process.env['L1_RPC_URL'] ?? 'http://localhost:18545';
const L2_RPC = process.env['L2_RPC_URL'] ?? 'http://localhost:29545';
const L3_RPC = process.env['L3_RPC_URL'] ?? 'http://localhost:39545';

const NODES: Array<{ name: string; layer: string; chainId: number; rpc: string }> = [
  { name: 'GhostChain L1',       layer: 'L1', chainId: 14000101, rpc: L1_RPC },
  { name: 'GhostL2 (op-geth)',   layer: 'L2', chainId: 901,      rpc: L2_RPC },
  { name: 'GhostL3 (op-geth)',   layer: 'L3', chainId: 903,      rpc: L3_RPC },
];

async function probeNode(rpc: string): Promise<{ status: string; blockNumber?: number }> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(4_000),
  });
  const json = await res.json() as { result?: string };
  if (typeof json.result !== 'string') throw new Error('bad response');
  return { status: 'online', blockNumber: parseInt(json.result, 16) };
}

export async function GET(): Promise<NextResponse> {
  const results = await Promise.all(
    NODES.map(async (node) => {
      try {
        const probe = await probeNode(node.rpc);
        return { ...node, ...probe };
      } catch {
        return { ...node, status: 'offline' };
      }
    }),
  );
  return NextResponse.json({ nodes: results });
}

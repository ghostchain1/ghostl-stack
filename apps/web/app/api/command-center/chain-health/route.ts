import { NextResponse } from 'next/server';

const RPC_URLS: Record<string, string> = {
  l1: process.env['L1_RPC_URL'] ?? 'http://localhost:18545',
  l2: process.env['L2_RPC_URL'] ?? 'http://localhost:29547',
  l3: process.env['L3_RPC_URL'] ?? 'http://localhost:39545',
};

async function jsonRpc(url: string, method: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    signal: AbortSignal.timeout(4_000),
  });
  const json = await res.json() as { result?: string };
  if (typeof json.result !== 'string') throw new Error('bad response');
  return json.result;
}

export async function GET(request: Request): Promise<NextResponse> {
  const chain = new URL(request.url).searchParams.get('chain') ?? '';
  const rpcUrl = RPC_URLS[chain];
  if (!rpcUrl) {
    return NextResponse.json({ error: 'unknown chain' }, { status: 400 });
  }

  try {
    const [rawChainId, rawBlock] = await Promise.all([
      jsonRpc(rpcUrl, 'eth_chainId'),
      jsonRpc(rpcUrl, 'eth_blockNumber'),
    ]);
    return NextResponse.json({
      status: 'ok',
      chainId: parseInt(rawChainId, 16),
      blockNumber: parseInt(rawBlock, 16),
    });
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 200 });
  }
}

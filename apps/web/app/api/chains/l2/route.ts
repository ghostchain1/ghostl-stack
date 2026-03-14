/**
 * /api/chains/l2/route.ts — BFF proxy for GhostL2 OP Stack details.
 */

import { NextResponse } from 'next/server';

const L2_RPC = process.env['L2_RPC_URL'] ?? 'http://localhost:29545';

async function jsonRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(L2_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal:  AbortSignal.timeout(4_000),
  });
  const json = await res.json() as { result?: unknown };
  return json.result ?? null;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [blockRaw, gasPriceRaw, chainIdRaw, peerCountRaw] = await Promise.allSettled([
      jsonRpc('eth_blockNumber'),
      jsonRpc('eth_gasPrice'),
      jsonRpc('eth_chainId'),
      jsonRpc('net_peerCount'),
    ]);

    const block    = blockRaw.status === 'fulfilled'     ? parseInt(String(blockRaw.value), 16)    : null;
    const gasPrice = gasPriceRaw.status === 'fulfilled'  ? parseInt(String(gasPriceRaw.value), 16) : null;
    const chainId  = chainIdRaw.status === 'fulfilled'   ? parseInt(String(chainIdRaw.value), 16)  : null;
    const peers    = peerCountRaw.status === 'fulfilled' ? parseInt(String(peerCountRaw.value), 16) : null;

    return NextResponse.json({
      layer:       'l2',
      chainId:     chainId ?? 901,
      label:       'GhostL2',
      blockNumber: block,
      gasPriceGwei: gasPrice != null ? gasPrice / 1e9 : null,
      peers,
      rollupType:  'OP Stack',
      settlementLayer: 'l1',
      ok: block != null,
    });
  } catch {
    return NextResponse.json(
      { layer: 'l2', ok: false, error: 'L2 unreachable' },
      { status: 200 },
    );
  }
}

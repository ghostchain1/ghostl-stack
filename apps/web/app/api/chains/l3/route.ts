/**
 * /api/chains/l3/route.ts — BFF proxy for GhostL3 runtime details.
 */

import { NextResponse } from 'next/server';

const L3_RPC = process.env['L3_RPC_URL'] ?? 'http://localhost:39545';

async function jsonRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(L3_RPC, {
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
      jsonRpc('ghost_blockNumber'),
      jsonRpc('ghost_gasPrice'),
      jsonRpc('ghost_chainId'),
      jsonRpc('net_peerCount'),
    ]);

    const block    = blockRaw.status === 'fulfilled'     ? parseInt(String(blockRaw.value), 16)    : null;
    const gasPrice = gasPriceRaw.status === 'fulfilled'  ? parseInt(String(gasPriceRaw.value), 16) : null;
    const chainId  = chainIdRaw.status === 'fulfilled'   ? parseInt(String(chainIdRaw.value), 16)  : null;
    const peers    = peerCountRaw.status === 'fulfilled' ? parseInt(String(peerCountRaw.value), 16) : null;

    return NextResponse.json({
      layer:       'l3',
      chainId:     chainId ?? 903,
      label:       'GhostL3',
      blockNumber: block,
      gasPriceGwei: gasPrice != null ? gasPrice / 1e9 : null,
      peers,
      rollupType:  'Ghost app rollup',
      settlementLayer: 'l2',
      ok: block != null,
    });
  } catch {
    return NextResponse.json(
      { layer: 'l3', ok: false, error: 'L3 unreachable' },
      { status: 200 },
    );
  }
}

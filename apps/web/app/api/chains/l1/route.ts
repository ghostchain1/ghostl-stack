/**
 * /api/chains/l1/route.ts — BFF proxy for GhostChain L1 details.
 *
 * Returns enriched L1 state: block info, gas price, peer count, Cosmos LCD
 * validator set summary, and CometBFT consensus health.
 */

import { NextResponse } from 'next/server';

const L1_RPC    = process.env['L1_RPC_URL']    ?? 'http://localhost:18545';
const COSMOS_LCD = process.env['COSMOS_LCD_URL'] ?? 'http://localhost:1317';

async function jsonRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(L1_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal:  AbortSignal.timeout(4_000),
  });
  const json = await res.json() as { result?: unknown };
  return json.result ?? null;
}

async function cosmosGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${COSMOS_LCD}${path}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const [chainIdRaw, blockRaw, gasPriceRaw, peerCountRaw, cosmosValidators] =
      await Promise.allSettled([
        jsonRpc('eth_chainId'),
        jsonRpc('eth_blockNumber'),
        jsonRpc('eth_gasPrice'),
        jsonRpc('net_peerCount'),
        cosmosGet<{ result?: { total?: string } }>('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=1'),
      ]);

    const chainId   = chainIdRaw.status === 'fulfilled' ? parseInt(String(chainIdRaw.value), 16) : null;
    const block     = blockRaw.status === 'fulfilled'   ? parseInt(String(blockRaw.value), 16)   : null;
    const gasPrice  = gasPriceRaw.status === 'fulfilled' ? parseInt(String(gasPriceRaw.value), 16) : null;
    const peers     = peerCountRaw.status === 'fulfilled' ? parseInt(String(peerCountRaw.value), 16) : null;
    const valTotal  = cosmosValidators.status === 'fulfilled'
      ? Number(cosmosValidators.value?.result?.total ?? 0) || null
      : null;

    return NextResponse.json({
      layer:      'l1',
      chainId:    chainId ?? 14000101,
      label:      'GhostChain L1',
      blockNumber: block,
      gasPriceGwei: gasPrice != null ? gasPrice / 1e9 : null,
      peers,
      activeValidators: valTotal,
      consensus:  'CometBFT + EVM',
      ok:         block != null,
    });
  } catch {
    return NextResponse.json(
      { layer: 'l1', ok: false, error: 'L1 unreachable' },
      { status: 200 },
    );
  }
}

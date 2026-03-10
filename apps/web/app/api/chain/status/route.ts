/**
 * /api/chain/status — Unified chain status aggregate.
 *
 * Calls L1/L2/L3 BFF routes in parallel and returns a single combined
 * snapshot, so UI components can fetch one endpoint instead of three.
 *
 * Env vars (inherited from the individual chain routes):
 *   L1_RPC_URL, L2_RPC_URL, L3_RPC_URL, COSMOS_LCD_URL
 */

import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

type LayerSnap = {
  layer: string;
  name: string;
  chainId: string;
  blockNumber: string;
  gasPrice: string;
  peers: number;
  status: 'healthy' | 'degraded' | 'down';
  ok: boolean;
};

async function fetchLayer(layer: 'l1' | 'l2' | 'l3'): Promise<LayerSnap> {
  try {
    const res = await fetch(`${BASE_URL}/api/chains/${layer}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as LayerSnap;
  } catch {
    return {
      layer,
      name: layer === 'l1' ? 'GhostChain' : layer === 'l2' ? 'GhostL2' : 'GhostL3',
      chainId: layer === 'l1' ? '14000101' : layer === 'l2' ? '901' : '903',
      blockNumber: '0',
      gasPrice: '0',
      peers: 0,
      status: 'down',
      ok: false,
    };
  }
}

export async function GET() {
  const [l1, l2, l3] = await Promise.all([
    fetchLayer('l1'),
    fetchLayer('l2'),
    fetchLayer('l3'),
  ]);

  const allHealthy = l1.status === 'healthy' && l2.status === 'healthy' && l3.status === 'healthy';
  const anyDown    = l1.status === 'down'    || l2.status === 'down'    || l3.status === 'down';

  return NextResponse.json(
    {
      l1,
      l2,
      l3,
      summary: {
        overallStatus: anyDown ? 'degraded' : allHealthy ? 'healthy' : 'degraded',
        layersOnline: [l1, l2, l3].filter(l => l.status === 'healthy').length,
        timestamp: new Date().toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

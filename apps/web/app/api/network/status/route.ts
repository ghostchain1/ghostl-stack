/**
 * /api/network/status — Network health across all three chain layers.
 *
 * Pings RPC endpoints for L1/L2/L3 and the GhostBrain network-health
 * API, then returns a combined view.
 *
 * Env vars:
 *   L1_RPC_URL, L2_RPC_URL, L3_RPC_URL   (defaults: :18545, :29545, :39545)
 *   GHOSTBRAIN_INTERNAL                   (default: :7900)
 */

import { NextResponse } from 'next/server';

const L1_RPC   = process.env.L1_RPC_URL           ?? 'http://localhost:18545';
const L2_RPC   = process.env.L2_RPC_URL           ?? 'http://localhost:29545';
const L3_RPC   = process.env.L3_RPC_URL           ?? 'http://localhost:39545';
const BRAIN    = process.env.GHOSTBRAIN_INTERNAL   ?? 'http://localhost:7900';

interface LayerPing {
  layer: string;
  chainId: string;
  blockNumber: string | null;
  latencyMs: number;
  reachable: boolean;
}

async function pingRpc(layer: string, chainId: string, url: string): Promise<LayerPing> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(4_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { layer, chainId, blockNumber: null, latencyMs, reachable: false };
    const json = (await res.json()) as { result?: string };
    const hex  = json.result ?? '0x0';
    const blockNumber = parseInt(hex, 16).toString();
    return { layer, chainId, blockNumber, latencyMs, reachable: true };
  } catch {
    return { layer, chainId, blockNumber: null, latencyMs: Date.now() - start, reachable: false };
  }
}

export async function GET() {
  const [l1, l2, l3, brainHealthRaw] = await Promise.all([
    pingRpc('l1', '14000101', L1_RPC),
    pingRpc('l2', '901',      L2_RPC),
    pingRpc('l3', '903',      L3_RPC),
    fetch(`${BRAIN}/network/health`, { cache: 'no-store', signal: AbortSignal.timeout(4_000) })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),
  ]);

  const layers    = [l1, l2, l3];
  const reachable = layers.filter(l => l.reachable).length;
  const overall   = reachable === 3 ? 'healthy' : reachable > 0 ? 'degraded' : 'down';

  return NextResponse.json(
    {
      overall,
      reachableLayers: reachable,
      layers: { l1, l2, l3 },
      ghostbrain: brainHealthRaw ?? { alertLevel: 'green' },
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

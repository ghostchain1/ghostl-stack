/**
 * /api/bridge/liquidity — Cross-chain liquidity pool snapshot.
 *
 * Aggregates pool data from:
 *   - GhostBrain liquidity endpoint
 *   - Direct L2/L3 bridge contract balance reads (eth_call)
 *
 * Canonical bridge addresses (from copilot-instructions.md):
 *   L2L3Bridge        0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
 *   L1 Rollup (L2)    0xad32D5C2Da9f4159C4cc98686C005852b3905355
 *   L2 Rollup (L3)    0x130A46b6E41DB6E1e18fb9c759F223c459190e90
 *
 * Env vars:
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 *   L1_RPC_URL            default http://localhost:18545
 *   L2_RPC_URL            default http://localhost:29545
 *   L3_RPC_URL            default http://localhost:39545
 */

import { NextResponse } from 'next/server';

const BRAIN  = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';
const L1_RPC = process.env.L1_RPC_URL         ?? 'http://localhost:18545';
const L2_RPC = process.env.L2_RPC_URL         ?? 'http://localhost:29545';
const L3_RPC = process.env.L3_RPC_URL         ?? 'http://localhost:39545';

// Canonical bridge addresses — never modified without governance proposal
const BRIDGES = [
  { name: 'L2L3Bridge',      address: '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2', rpc: L2_RPC, chains: 'L2→L3' },
  { name: 'L1 Rollup (L2)', address: '0xad32D5C2Da9f4159C4cc98686C005852b3905355', rpc: L1_RPC, chains: 'L1→L2' },
  { name: 'L2 Rollup (L3)', address: '0x130A46b6E41DB6E1e18fb9c759F223c459190e90', rpc: L2_RPC, chains: 'L2→L3' },
] as const;

async function getBalance(rpc: string, address: string): Promise<bigint | null> {
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'eth_getBalance',
        params:  [address, 'latest'],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string };
    return data.result ? BigInt(data.result) : null;
  } catch {
    return null;
  }
}

async function getBrainPools(): Promise<unknown[]> {
  try {
    const res = await fetch(`${BRAIN}/liquidity/pools`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { pools?: unknown[] } | unknown[];
    return Array.isArray(data) ? data : ((data as { pools?: unknown[] }).pools ?? []);
  } catch {
    return [];
  }
}

type Pool = {
  name:       string;
  address:    string;
  chains:     string;
  tvlWei:     string | null;
  tvlGST:     string | null;
  source:     string;
  status:     'live' | 'error';
};

export async function GET() {
  const [brainPools, ...balances] = await Promise.all([
    getBrainPools(),
    ...BRIDGES.map(b => getBalance(b.rpc, b.address)),
  ]);

  const GST_UNIT = 10n ** 18n;

  // On-chain pool data from bridge contract balances
  const onChainPools: Pool[] = BRIDGES.map((b, i) => {
    const wei = balances[i];
    const gst = wei != null ? (Number(wei * 10000n / GST_UNIT) / 10000).toFixed(4) : null;
    return {
      name:    b.name,
      address: b.address,
      chains:  b.chains,
      tvlWei:  wei?.toString() ?? null,
      tvlGST:  gst,
      source:  'on-chain',
      status:  wei != null ? 'live' : 'error',
    };
  });

  // GhostBrain pool data (if available)
  const brainFormatted: Pool[] = (brainPools as Array<Record<string, unknown>>).map(p => ({
    name:    String(p.name  ?? p.pool_name  ?? 'Unknown Pool'),
    address: String(p.address ?? '0x0'),
    chains:  String(p.chains  ?? p.pair ?? '—'),
    tvlWei:  p.tvl_wei  != null ? String(p.tvl_wei)  : null,
    tvlGST:  p.tvl_gst  != null ? String(p.tvl_gst)  : (p.tvl != null ? String(p.tvl) : null),
    source:  'ghostbrain',
    status:  'live',
  }));

  const pools =
    brainFormatted.length > 0
      ? [...brainFormatted, ...onChainPools]
      : onChainPools;

  return NextResponse.json(
    { pools, count: pools.length, timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

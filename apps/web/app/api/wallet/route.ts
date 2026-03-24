/**
 * /api/wallet — GhostWallet user balance + transaction summary.
 *
 * Aggregates GST balances across L1 / L2 / L3 via direct RPC calls
 * and fetches recent transactions from the main API.
 *
 * Env vars:
 *   API_INTERNAL_URL   default http://localhost:4000
 *   L1_RPC_URL         default http://localhost:18545
 *   L2_RPC_URL         default http://localhost:29545
 *   L3_RPC_URL         default http://localhost:39545
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const L1_RPC   = process.env.L1_RPC_URL ?? 'http://localhost:18545';
const L2_RPC   = process.env.L2_RPC_URL ?? 'http://localhost:29545';
const L3_RPC   = process.env.L3_RPC_URL ?? 'http://localhost:39545';

async function rpcBalance(rpcUrl: string, address: string): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await res.json()) as { result?: string };
    const hex = data.result;
    if (!hex) return null;
    const raw = BigInt(hex);
    const gst = (Number(raw) / 1e18).toFixed(4);
    return gst;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') ?? '';

  // Fetch API-backed wallet data and per-layer RPC balances in parallel
  const [apiRes, l1Bal, l2Bal, l3Bal] = await Promise.allSettled([
    fetch(`${API_BASE}/wallet${address ? `?address=${encodeURIComponent(address)}` : ''}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    }),
    address ? rpcBalance(L1_RPC, address) : Promise.resolve(null),
    address ? rpcBalance(L2_RPC, address) : Promise.resolve(null),
    address ? rpcBalance(L3_RPC, address) : Promise.resolve(null),
  ]);

  let apiData: Record<string, unknown> = {};
  if (apiRes.status === 'fulfilled' && apiRes.value.ok) {
    apiData = (await apiRes.value.json()) as Record<string, unknown>;
  }

  const l1Balance = l1Bal.status === 'fulfilled' ? l1Bal.value : null;
  const l2Balance = l2Bal.status === 'fulfilled' ? l2Bal.value : null;
  const l3Balance = l3Bal.status === 'fulfilled' ? l3Bal.value : null;

  return NextResponse.json({
    address: address || (apiData.address as string | undefined) || null,
    l1Balance,
    l2Balance,
    l3Balance,
    totalGst: apiData.totalGst ?? null,
    stakedGst: apiData.stakedGst ?? null,
    pendingRewards: apiData.pendingRewards ?? null,
    usdEquivalent: apiData.usdEquivalent ?? null,
    transactions: apiData.transactions ?? [],
    staking: apiData.staking ?? [],
    ok: true,
  });
}

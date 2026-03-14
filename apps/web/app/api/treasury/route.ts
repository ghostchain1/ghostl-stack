/**
 * /api/treasury — Root-level treasury snapshot.
 *
 * Quick-access route that aggregates the key treasury numbers for the
 * dashboard status widget.  For the full intelligence view (flows, AI recs)
 * see /api/treasury/intelligence.
 *
 * Env vars:
 *   TREASURY_ENGINE_URL   default http://localhost:7683
 */

import { NextResponse } from 'next/server';

const TREASURY_URL = process.env.TREASURY_ENGINE_URL ?? 'http://localhost:7683';

export async function GET() {
  try {
    const res = await fetch(`${TREASURY_URL}/api/snapshot`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `treasury engine returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as Record<string, unknown>;

    const totalGST     = (data.totalGST     as string | undefined) ?? '0';
    const availableGST = (data.availableGST as string | undefined) ?? '0';
    const lockedGST    = (data.lockedGST    as string | undefined) ?? '0';
    const burnedGST    = (data.burnedGST    as string | undefined) ?? '0';
    const inflowGST24h = (data.inflowGST24h as string | undefined) ?? '0';
    const outflowGST24h= (data.outflowGST24h as string | undefined)  ?? '0';
    const stakingRewards= (data.stakingRewards as string | undefined) ?? '0';
    const pendingApprovals = (data.pendingApprovals as number | undefined) ?? 0;

    return NextResponse.json(
      {
        balanceGST:      totalGST,
        availableGST,
        lockedGST,
        burned:          burnedGST,
        stakingRewards,
        inflowGST24h,
        outflowGST24h,
        pendingApprovals,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'treasury engine unreachable' },
      { status: 502 },
    );
  }
}

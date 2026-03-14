/**
 * /api/ai/network-health — AI-computed risk scores for L1/L2/L3.
 */

import { NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${BRAIN_URL}/network-health`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GhostBrain Core unreachable' },
      { status: 502 },
    );
  }
}

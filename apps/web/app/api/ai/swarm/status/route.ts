/**
 * /api/ai/swarm/status — Proxy GhostBrain swarm status.
 */

import { NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${BRAIN_URL}/swarm/status`, {
      signal: AbortSignal.timeout(5_000),
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

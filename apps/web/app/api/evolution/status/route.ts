/**
 * /api/evolution/status
 *
 * BFF proxy to the ghost-protocol-evolution service (port 7924).
 * Returns zero-state on offline so the dashboard degrades gracefully.
 */

import { NextResponse } from 'next/server';

const EVOLUTION_URL =
  process.env.GHOST_EVOLUTION_INTERNAL_URL ??
  process.env.GHOST_EVOLUTION_URL ??
  'http://localhost:7924';

const ZERO_STATE = {
  phase: 'idle',
  cycleCount: 0,
  improvementsDetected: 0,
  simulationsRun: 0,
  proposalsGenerated: 0,
  proposalsSubmitted: 0,
  proposalsFailed: 0,
  lastCycleAt: null,
  recentProposals: [],
  recentAnalyses: [],
  ts: new Date().toISOString(),
};

export async function GET() {
  try {
    const r = await fetch(`${EVOLUTION_URL}/status`, {
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 0 },
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `evolution engine returned ${r.status}`, ...ZERO_STATE },
        { status: 502 },
      );
    }

    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ...ZERO_STATE, error: 'evolution engine offline' });
  }
}

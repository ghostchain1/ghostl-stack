/**
 * /api/strategy/status
 *
 * BFF proxy to the GhostBrain Strategic Intelligence System (port 7925).
 * Returns a zero-state snapshot when the SIS is offline so the dashboard
 * degrades gracefully.
 */

import { NextResponse } from 'next/server';

const SIS_URL =
  process.env.GHOST_STRATEGY_INTERNAL_URL ??
  process.env.GHOST_STRATEGY_URL ??
  'http://localhost:7925';

const ZERO_STATE = {
  phase:              'idle',
  cycleCount:         0,
  forecastsRun:       0,
  proposalsGenerated: 0,
  proposalsSubmitted: 0,
  proposalsFailed:    0,
  lastCycleAt:        null,
  currentSnapshot:    null,
  recentProposals:    [],
  dryRun:             false,
  ts:                 new Date().toISOString(),
};

export async function GET() {
  try {
    const r = await fetch(`${SIS_URL}/status`, {
      signal: AbortSignal.timeout(6_000),
      next:   { revalidate: 0 },
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `SIS returned ${r.status}`, ...ZERO_STATE },
        { status: 502 },
      );
    }

    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ...ZERO_STATE, error: 'ghostbrain-strategy offline' });
  }
}

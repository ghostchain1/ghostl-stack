/**
 * /api/swarm/status
 *
 * Proxies the ghostbrain-coordinator status endpoint so the Swarm Dashboard
 * can display active agents, alert counts, and recent proposals without
 * needing direct access to the coordinator service.
 *
 * GET /api/swarm/status
 */

import { NextResponse } from 'next/server';

const COORDINATOR_URL =
  process.env.GHOSTCOORDINATOR_INTERNAL_URL ??
  process.env.GHOSTCOORDINATOR_URL ??
  'http://localhost:7923';

const ZERO_STATE = {
  natsConnected: false,
  activeAgents: [],
  alertCounts: { validator: 0, network: 0, security: 0 },
  recentAlerts: [],
  recentProposals: [],
  uptimeSec: 0,
  ts: new Date().toISOString(),
};

export async function GET() {
  try {
    const r = await fetch(`${COORDINATOR_URL}/status`, {
      signal: AbortSignal.timeout(6_000),
      next: { revalidate: 0 },
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: `coordinator returned ${r.status}`, ...ZERO_STATE },
        { status: 502 },
      );
    }

    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    // Coordinator offline — return zero-state so the dashboard degrades gracefully
    return NextResponse.json({ ...ZERO_STATE, error: 'coordinator offline' });
  }
}

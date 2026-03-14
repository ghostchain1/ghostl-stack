/**
 * /api/portal/governance — Proxy to governance service for proposal data.
 *
 * GET: Returns active, pending, and recent proposals.
 */

import { type NextRequest, NextResponse } from 'next/server';

const GOV_URL = process.env.GOV_SERVICE_URL ?? process.env.GOVERNANCE_SERVICE_URL ?? 'http://localhost:7685';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${GOV_URL}/api/proposals`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json({ proposals: [], total: 0 }, { status: 200 });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    // Governance service may not be running in all envs — return empty gracefully
    return NextResponse.json({ proposals: [], totalProposals: 0, quorumReached: 0 }, { status: 200 });
  }
}

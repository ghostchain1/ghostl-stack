/**
 * /api/portal/security — Portal security data: alerts, audit log, session stats, IP blocklist.
 *
 * GET: Returns security dashboard data from compliance service + NOC AI.
 */

import { type NextRequest, NextResponse } from 'next/server';

const COMPLIANCE_URL = process.env.COMPLIANCE_SERVICE_URL ?? 'http://localhost:8090';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${COMPLIANCE_URL}/api/security/summary`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ alerts: [], audit: [], activeSessions: 0, blockedIPs: 0 }, { status: 200 });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ alerts: [], audit: [], activeSessions: 0, blockedIPs: 0 }, { status: 200 });
  }
}

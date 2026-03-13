/**
 * /api/portal/noc — Proxy to ghost-noc-ai status endpoint.
 *
 * Returns recent alerts, proposal history, and monitor health.
 */

import { type NextRequest, NextResponse } from 'next/server';

const NOC_URL = process.env.NOC_AI_URL ?? 'http://localhost:7960';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${NOC_URL}/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'NOC AI offline';
    return NextResponse.json({ error: msg, alerts: [], proposals: [] }, { status: 503 });
  }
}

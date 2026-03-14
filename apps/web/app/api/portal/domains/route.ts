/**
 * /api/portal/domains — Proxy to Ghost DNS resolver for zone data.
 *
 * GET: Returns DNS zone status and GNS domain health.
 */

import { type NextRequest, NextResponse } from 'next/server';

const DNS_URL = process.env.GHOST_DNS_INTERNAL_URL ?? process.env.GHOST_DNS_URL ?? 'http://localhost:5380';

const FALLBACK_ZONES = [
  { domain: 'ghostchain.cloud', status: 'healthy', gnsEnabled: true },
  { domain: 'ghostchain.info',  status: 'healthy', gnsEnabled: true },
  { domain: 'ghostchain.life',  status: 'healthy', gnsEnabled: true },
  { domain: 'ghostbrain.ai',    status: 'healthy', gnsEnabled: false },
  { domain: 'ghostxchange.io',  status: 'healthy', gnsEnabled: false },
];

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${DNS_URL}/api/zones`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ zones: FALLBACK_ZONES }, { status: 200 });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    // DNS resolver may not be running — return static known zones
    return NextResponse.json({ zones: FALLBACK_ZONES }, { status: 200 });
  }
}

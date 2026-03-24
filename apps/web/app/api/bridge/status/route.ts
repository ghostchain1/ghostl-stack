/**
 * /api/bridge/status — Bridge health and recent transfer summary.
 *
 * Proxies to main API + bridge liquidity for combined status.
 */

import { NextResponse } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET() {
  try {
    const [statusRes, liqRes] = await Promise.allSettled([
      fetch(`${API_BASE}/bridge/status`, { cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${API_BASE}/bridge/liquidity`, { cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
    ]);

    let status: Record<string, unknown> = {};
    let liquidity: Record<string, unknown> = {};

    if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
      status = (await statusRes.value.json()) as Record<string, unknown>;
    }
    if (liqRes.status === 'fulfilled' && liqRes.value.ok) {
      liquidity = (await liqRes.value.json()) as Record<string, unknown>;
    }

    return NextResponse.json({
      ok: true,
      bridges: status.bridges ?? [],
      liquidity: liquidity.pools ?? [],
      pending: status.pending ?? 0,
      finalized: status.finalized ?? 0,
      signaturesMissing: status.signaturesMissing ?? 0,
      lastUpdated: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Bridge status unavailable' }, { status: 200 });
  }
}

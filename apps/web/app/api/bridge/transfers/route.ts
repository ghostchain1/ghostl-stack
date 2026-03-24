/**
 * /api/bridge/transfers — Recent cross-layer transfer history.
 *
 * Query params:
 *   address  = 0x…            (optional — filter by user address)
 *   limit    = 1–100          (default: 25)
 *   layer    = l1 | l2 | l3   (optional — filter by source layer)
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = searchParams.get('address') ?? '';
  const limit   = Math.min(Number(searchParams.get('limit') ?? '25'), 100);
  const layer   = searchParams.get('layer') ?? '';

  const params = new URLSearchParams({ limit: String(limit) });
  if (address) params.set('address', address);
  if (layer)   params.set('layer', layer);

  try {
    const res = await fetch(`${API_BASE}/bridge/transfers?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, transfers: [], error: `upstream ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { transfers?: unknown[] };
    return NextResponse.json({ ok: true, transfers: data.transfers ?? [] });
  } catch {
    return NextResponse.json({ ok: false, transfers: [], error: 'Bridge transfers unavailable' }, { status: 200 });
  }
}

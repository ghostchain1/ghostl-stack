/**
 * /api/alerts/my — User-scoped alert list.
 *
 * Returns alerts for the authenticated user. Proxies to main API
 * with user session identity forwarded.
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get('since') ?? '';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '50'), 200);

  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since', since);

  // Forward session cookie to upstream
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const res = await fetch(`${API_BASE}/alerts/my?${params}`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, alerts: [], error: `upstream ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { alerts?: unknown[] };
    return NextResponse.json({ ok: true, alerts: data.alerts ?? [] });
  } catch {
    return NextResponse.json({ ok: false, alerts: [], error: 'Alerts service unavailable' }, { status: 200 });
  }
}

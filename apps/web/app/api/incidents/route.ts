/**
 * /api/incidents — Employee incident queue.
 *
 * GET: list current incidents with severity / status filters.
 * Query params: status, severity, limit
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status   = searchParams.get('status')   ?? '';
  const severity = searchParams.get('severity') ?? '';
  const limit    = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const params = new URLSearchParams({ limit: String(limit) });
  if (status)   params.set('status', status);
  if (severity) params.set('severity', severity);

  try {
    const res = await fetch(`${API_BASE}/incidents?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, incidents: [], error: `upstream ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { incidents?: unknown[] };
    return NextResponse.json({ ok: true, incidents: data.incidents ?? [] });
  } catch {
    return NextResponse.json({ ok: false, incidents: [], error: 'Incidents service unavailable' }, { status: 200 });
  }
}

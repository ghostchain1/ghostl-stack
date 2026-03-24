/**
 * /api/alerts/[id]/acknowledge — Acknowledge a single alert.
 *
 * POST with no body — just the alert ID in the path.
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Alert ID required' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const res = await fetch(`${API_BASE}/alerts/${encodeURIComponent(id)}/acknowledge`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(6_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Alerts service unavailable' }, { status: 503 });
  }
}

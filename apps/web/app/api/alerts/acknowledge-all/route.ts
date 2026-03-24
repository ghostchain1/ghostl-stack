/**
 * /api/alerts/acknowledge-all — Acknowledge all pending alerts for the user.
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const res = await fetch(`${API_BASE}/alerts/acknowledge-all`, {
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

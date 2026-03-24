/**
 * /api/support/tickets — Support ticket queue for employees.
 *
 * GET:  list tickets with optional status/priority filters
 * Query params: status (open|in_progress|resolved|closed), priority, limit
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status   = searchParams.get('status')   ?? '';
  const priority = searchParams.get('priority') ?? '';
  const limit    = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const params = new URLSearchParams({ limit: String(limit) });
  if (status)   params.set('status', status);
  if (priority) params.set('priority', priority);

  try {
    const res = await fetch(`${API_BASE}/support/tickets?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, tickets: [], error: `upstream ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { tickets?: unknown[] };
    return NextResponse.json({ ok: true, tickets: data.tickets ?? [] });
  } catch {
    return NextResponse.json({ ok: false, tickets: [], error: 'Support service unavailable' }, { status: 200 });
  }
}

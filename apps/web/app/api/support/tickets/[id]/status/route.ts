/**
 * /api/support/tickets/[id]/status — Update support ticket status.
 *
 * POST body: { status: 'open' | 'in_progress' | 'resolved' | 'closed' }
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Ticket ID required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const status = String(body.status ?? '');
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { ok: false, error: 'status must be open, in_progress, resolved, or closed' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_BASE}/support/tickets/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(6_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Support service unavailable' }, { status: 503 });
  }
}

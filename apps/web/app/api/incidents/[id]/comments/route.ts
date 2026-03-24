/**
 * /api/incidents/[id]/comments — Add a comment to an incident.
 *
 * POST body: { text: string }
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Incident ID required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'Comment text is required' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ ok: false, error: 'Comment must be 2000 characters or fewer' }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/incidents/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(6_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Incidents service unavailable' }, { status: 503 });
  }
}

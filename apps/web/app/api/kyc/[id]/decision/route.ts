/**
 * /api/kyc/[id]/decision — Submit KYC review decision.
 *
 * POST body: { decision: 'approved' | 'rejected' | 'info_requested', notes?: string }
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const VALID_DECISIONS = new Set(['approved', 'rejected', 'info_requested']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'KYC submission ID required' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const decision = String(body.decision ?? '');
  const notes    = String(body.notes ?? '').slice(0, 2000);

  if (!VALID_DECISIONS.has(decision)) {
    return NextResponse.json(
      { ok: false, error: 'decision must be approved, rejected, or info_requested' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_BASE}/kyc/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, notes }),
      signal: AbortSignal.timeout(8_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'KYC service unavailable' }, { status: 503 });
  }
}

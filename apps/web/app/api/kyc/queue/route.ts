/**
 * /api/kyc/queue — KYC review queue for employees.
 *
 * GET: returns pending KYC submissions for review.
 * Query params: status (pending|approved|rejected|info_requested), limit
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? 'pending';
  const limit  = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const params = new URLSearchParams({ status, limit: String(limit) });

  try {
    const res = await fetch(`${API_BASE}/kyc/queue?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, queue: [], error: `upstream ${res.status}` }, { status: 200 });
    }

    const data = (await res.json()) as { queue?: unknown[]; submissions?: unknown[] };
    return NextResponse.json({ ok: true, queue: data.queue ?? data.submissions ?? [] });
  } catch {
    return NextResponse.json({ ok: false, queue: [], error: 'KYC service unavailable' }, { status: 200 });
  }
}

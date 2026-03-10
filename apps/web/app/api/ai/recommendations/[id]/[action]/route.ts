/**
 * /api/ai/recommendations/[id]/approve  — Approve an AI recommendation.
 * /api/ai/recommendations/[id]/reject   — Reject an AI recommendation.
 *
 * Approved actions are forwarded to GhostBrain Core which queues them to the
 * signing relay at http://localhost:7910 for human ratification.
 * No direct on-chain execution from the browser.
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

// Recommendation IDs: UUIDs or alphanumeric slugs, max 128 chars
const ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;

type RouteContext = { params: Promise<{ id: string; action: string }> };

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id, action } = await ctx.params;

  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid recommendation id' }, { status: 400 });
  }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  if (action === 'reject') {
    try {
      const parsed = await req.json() as Record<string, unknown>;
      // Only forward the reason field — never forward arbitrary data upstream
      if (typeof parsed.reason === 'string') {
        body = { reason: parsed.reason.slice(0, 512) };
      }
    } catch {
      // body is optional on reject
    }
  }

  try {
    const upstream = await fetch(
      `${BRAIN_URL}/recommendations/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `GhostBrain returned HTTP ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const data: unknown = await upstream.json().catch(() => ({ ok: true }));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GhostBrain Core unreachable' },
      { status: 502 },
    );
  }
}

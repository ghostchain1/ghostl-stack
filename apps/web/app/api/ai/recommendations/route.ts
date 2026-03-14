/**
 * /api/ai/recommendations — Fetch AI recommendations from GhostBrain Core.
 *
 * Query params:
 *   status = pending | approved | rejected | auto-executed | expired
 *            (default: all)
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

const VALID_STATUSES = new Set([
  'pending', 'approved', 'rejected', 'auto-executed', 'expired',
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const statusParam = req.nextUrl.searchParams.get('status') ?? '';

  // Validate the status param so it cannot be used to forge upstream paths
  const statusQuery = VALID_STATUSES.has(statusParam)
    ? `?status=${encodeURIComponent(statusParam)}`
    : '';

  try {
    const res = await fetch(`${BRAIN_URL}/recommendations${statusQuery}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GhostBrain returned HTTP ${res.status}` },
        { status: res.status },
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GhostBrain Core unreachable' },
      { status: 502 },
    );
  }
}

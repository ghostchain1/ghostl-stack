/**
 * /api/hypervisor/vm/action — Proxy VM actions to the GAIS kernel.
 *
 * Body: { id: string, action: "start"|"stop"|"reboot"|"suspend"|"resume" }
 *
 * Enforces the same safety invariants as the container action route.
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL   = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';
const ALLOWED_ACT = new Set(['start', 'stop', 'reboot', 'suspend', 'resume']);
const ID_RE       = /^[a-zA-Z0-9_\-.]{1,128}$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 });
  }

  const { id, action } = body as Record<string, unknown>;

  if (typeof id !== 'string' || !ID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid VM id' }, { status: 400 });
  }

  if (typeof action !== 'string' || !ALLOWED_ACT.has(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...ALLOWED_ACT].join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${BRAIN_URL}/kernel/vm/${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: id, type: 'vm', action }),
      signal: AbortSignal.timeout(15_000),
    });

    const data: unknown = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'kernel unreachable' },
      { status: 502 },
    );
  }
}

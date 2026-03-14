/**
 * /api/vm/restart — Restart a VM via GAIS kernel.
 *
 * Convenience alias for the hypervisor/vm/action route that enforces
 * "reboot" action.  Body: { id: string }
 *
 * Forwards to GAIS via the kernel safety guard (allowlist, dry-run,
 * rate limiter) — same invariants as /api/hypervisor/vm/action.
 *
 * Env vars:
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';
const ID_RE     = /^[a-zA-Z0-9_\-.]{1,128}$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { id } = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== 'string' || !ID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid VM id' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BRAIN_URL}/kernel/vm/reboot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: id, type: 'vm', action: 'reboot' }),
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

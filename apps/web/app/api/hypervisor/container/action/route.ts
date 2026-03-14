/**
 * /api/hypervisor/container/action — Proxy container actions to the kernel.
 *
 * Body: { name: string, action: "start"|"stop"|"restart"|"pause"|"unpause" }
 *
 * Forwards to the ghostbrain-core kernel HTTP interface which enforces:
 *   - Target allowlist (KERNEL_TARGET_ALLOWLIST)
 *   - Protected patterns (L1/signing relay/DB never touched)
 *   - Per-target rate limiting
 *   - DRY_RUN mode
 *
 * Security: input validated server-side; no user-supplied URLs forwarded.
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL    = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';
const ALLOWED_ACT  = new Set(['start', 'stop', 'restart', 'pause', 'unpause']);
// Container names: same pattern as safety_guard.ts TARGET_RE
const NAME_RE      = /^[a-zA-Z0-9_\-.]{1,128}$/;

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

  const { name, action } = body as Record<string, unknown>;

  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return NextResponse.json({ error: 'invalid container name' }, { status: 400 });
  }

  if (typeof action !== 'string' || !ALLOWED_ACT.has(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...ALLOWED_ACT].join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${BRAIN_URL}/kernel/docker/${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: name, type: 'docker', action }),
      signal: AbortSignal.timeout(10_000),
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

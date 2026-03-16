/**
 * /api/hypervisor/vm/action — Proxy supported VM actions to the live GAIS API.
 *
 * Body: { id: string, action: "start"|"stop"|"reboot"|"suspend"|"resume" }
 *
 * GAIS currently exposes manual restart as its operator-safe write path.
 * Unsupported actions return 501 until GAIS gains native endpoints for them.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { GAIS_URL, readGaisToken } from '../../../vm/lib';

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

  if (action !== 'reboot') {
    return NextResponse.json(
      {
        error: 'live GAIS currently supports reboot only',
        supportedActions: ['reboot'],
      },
      { status: 501 },
    );
  }

  try {
    const token = await readGaisToken();
    const upstream = await fetch(`${GAIS_URL}/vms/${encodeURIComponent(id)}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-GAIS-Token': token } : {}),
      },
      body: JSON.stringify({ force: false }),
      signal: AbortSignal.timeout(15_000),
    });

    const data: unknown = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GAIS unreachable' },
      { status: 502 },
    );
  }
}

/**
 * /api/vm/restart — Restart a VM via the live GAIS API.
 *
 * Convenience alias for the hypervisor/vm/action route that enforces
 * the GAIS restart path. Body: { id: string }
 *
 * Env vars:
 *   GAIS_URL         default http://127.0.0.1:9100
 *   GAIS_API_TOKEN   optional direct token override
 *   GAIS_ENV_FILE    optional path to the GAIS env file
 */

import { type NextRequest, NextResponse } from 'next/server';

import { GAIS_URL, readGaisToken } from '../lib';

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

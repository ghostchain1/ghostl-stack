/**
 * /api/portal/nodes/action — Submit node/validator restart proposals to the signing relay.
 *
 * Body: { name: string, action: "restart" | "restart_validator", type?: "node" | "validator" }
 *
 * All actions are proposals only — no autonomous execution. Human ratification required.
 */

import { type NextRequest, NextResponse } from 'next/server';

const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';
const ALLOWED_ACTIONS   = new Set(['restart', 'restart_validator', 'stop', 'propose_slash']);
const NAME_RE           = /^[a-zA-Z0-9_\-:.]{1,128}$/;

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

  const { name, action, type } = body as Record<string, unknown>;

  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return NextResponse.json({ error: 'invalid name — must match [a-zA-Z0-9_\\-:.]{1,128}' }, { status: 400 });
  }

  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...ALLOWED_ACTIONS].join(', ')}` },
      { status: 400 },
    );
  }

  const entityType = typeof type === 'string' ? type : 'node';

  const proposal = {
    id:        `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source:    'portal',
    type:      'infrastructure_proposal',
    entityType,
    target:    name,
    action,
    rationale: `Portal-initiated ${action} for ${entityType} ${name}`,
    timestamp: new Date().toISOString(),
    requiresQuorum: true,
  };

  try {
    const res = await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal),
      signal: AbortSignal.timeout(10_000),
    });

    const data: unknown = await res.json().catch(() => ({}));
    return NextResponse.json(
      { ok: res.ok, proposalId: proposal.id, relay: data },
      { status: res.ok ? 200 : 502 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'signing relay unreachable';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

/**
 * /api/bridge/initiate — Submit a cross-layer GST transfer request.
 *
 * POST body: { fromLayer, toLayer, amount, recipient, senderAddress }
 *
 * Routing law: L3→L2→L1 (never L3→L1 directly).
 * All bridge operations route through GhostChain L1.
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const VALID_LAYERS = new Set(['l1', 'l2', 'l3']);

// Routing law enforcement: L3 cannot go directly to L1
function validateRoutingLaw(from: string, to: string): string | null {
  if (from === 'l3' && to === 'l1') {
    return 'Routing law violation: L3→L1 direct bridge is not permitted. Route via L3→L2→L1.';
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const fromLayer   = String(body.fromLayer   ?? '').toLowerCase();
  const toLayer     = String(body.toLayer     ?? '').toLowerCase();
  const amount      = String(body.amount      ?? '');
  const recipient   = String(body.recipient   ?? '');
  const senderAddress = String(body.senderAddress ?? '');

  // Input validation
  if (!VALID_LAYERS.has(fromLayer) || !VALID_LAYERS.has(toLayer)) {
    return NextResponse.json({ ok: false, error: 'fromLayer and toLayer must be l1, l2, or l3' }, { status: 400 });
  }
  if (fromLayer === toLayer) {
    return NextResponse.json({ ok: false, error: 'fromLayer and toLayer must differ' }, { status: 400 });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ ok: false, error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!recipient.startsWith('0x') || recipient.length !== 42) {
    return NextResponse.json({ ok: false, error: 'Invalid recipient address' }, { status: 400 });
  }

  // Routing law check
  const routingError = validateRoutingLaw(fromLayer, toLayer);
  if (routingError) {
    return NextResponse.json({ ok: false, error: routingError }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_BASE}/bridge/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromLayer, toLayer, amount, recipient, senderAddress }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Bridge service unavailable' }, { status: 503 });
  }
}

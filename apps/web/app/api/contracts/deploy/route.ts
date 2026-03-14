/**
 * /api/contracts/deploy/route.ts — BFF route for contract deployment.
 *
 * Security controls:
 *  - Target chain must be one of L1/L2/L3 — hardcoded RPC map, no user-supplied URLs
 *  - Bytecode validated: must start with 0x, hex-only, max 48 KB
 *  - Constructor args must be a valid JSON array
 *  - Value must parse as a non-negative number
 *  - Session + ADMIN role required (enforced via access-policy)
 */

import { NextResponse, type NextRequest } from 'next/server';

type Layer = 'l1' | 'l2' | 'l3';

// Hardcoded internal RPC map — never accept RPC from user input
const INTERNAL_API = process.env['API_INTERNAL_URL'] ?? 'http://localhost:4000';

const VALID_LAYERS = new Set<Layer>(['l1', 'l2', 'l3']);
const HEX_RE       = /^0x[0-9a-fA-F]+$/;
const MAX_BYTECODE = 48 * 1024;  // 48 KB

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const layer         = body['layer'] as string | undefined;
  const bytecode      = body['bytecode'] as string | undefined;
  const ctorArgsRaw   = (body['constructorArgs'] as string | undefined) ?? '[]';
  const valueGstRaw   = (body['valueGst'] as string | undefined) ?? '0';

  // Validate layer
  if (!layer || !VALID_LAYERS.has(layer as Layer)) {
    return NextResponse.json({ ok: false, error: 'layer must be l1, l2, or l3' }, { status: 400 });
  }

  // Validate bytecode
  if (!bytecode || !HEX_RE.test(bytecode)) {
    return NextResponse.json({ ok: false, error: 'bytecode must be 0x-prefixed hex' }, { status: 400 });
  }
  if (bytecode.length / 2 > MAX_BYTECODE) {
    return NextResponse.json({ ok: false, error: 'bytecode exceeds 48 KB limit' }, { status: 400 });
  }

  // Validate constructor args (must be parseable JSON array)
  let ctorArgs: unknown[];
  try {
    const parsed = JSON.parse(ctorArgsRaw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('not array');
    ctorArgs = parsed;
  } catch {
    return NextResponse.json({ ok: false, error: 'constructorArgs must be a JSON array' }, { status: 400 });
  }

  // Validate value
  const valueGst = Number(valueGstRaw);
  if (!isFinite(valueGst) || valueGst < 0) {
    return NextResponse.json({ ok: false, error: 'valueGst must be a non-negative number' }, { status: 400 });
  }

  // Forward to internal ghost-api which handles wallet signing  
  try {
    const res = await fetch(`${INTERNAL_API}/api/contracts/deploy`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ layer, bytecode, constructorArgs: ctorArgs, valueGst }),
      signal:  AbortSignal.timeout(30_000),
    });
    const data = await res.json() as unknown;
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'deploy failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

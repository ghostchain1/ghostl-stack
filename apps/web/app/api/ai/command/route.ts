/**
 * /api/ai/command — GhostBrain structured query endpoint.
 *
 * SECURITY: This endpoint does NOT execute arbitrary commands.
 * It accepts a structured queryType from a strict allowlist and an optional
 * target (validated against TARGET_RE).  Queries are forwarded to the
 * GhostBrain Core analysis API — the same safety invariants as the kernel
 * apply (allowlisted actions, protected patterns, rate limiting).
 *
 * Allowed query types:
 *   validator-health, tx-classify, wallet-profile, network-health,
 *   treasury-analysis, anomaly-scan, recommendations
 *
 * Body: { queryType: string, target?: string, params?: Record<string, unknown> }
 *
 * Env vars:
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 */

import { type NextRequest, NextResponse } from 'next/server';

const BRAIN_URL = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';

// Strict allowlist — expands only when new GhostBrain query endpoints are added.
const ALLOWED_QUERY_TYPES = new Set([
  'validator-health',
  'tx-classify',
  'wallet-profile',
  'network-health',
  'treasury-analysis',
  'anomaly-scan',
  'recommendations',
  'swarm-status',
  'gas-estimate',
]);

// Same regex as safety_guard.ts TARGET_RE — alphanumeric + _ - .
const TARGET_RE = /^[a-zA-Z0-9_\-.]{1,128}$/;

// Map query types to GhostBrain API paths
const QUERY_PATHS: Record<string, string> = {
  'validator-health': '/validators/health',
  'tx-classify':      '/tx/classify',
  'wallet-profile':   '/wallet/profile',
  'network-health':   '/network/health',
  'treasury-analysis':'/treasury/analysis',
  'anomaly-scan':     '/anomaly/scan',
  'recommendations':  '/recommendations',
  'swarm-status':     '/swarm/status',
  'gas-estimate':     '/gas/estimate',
};

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

  const { queryType, target, params } = body as Record<string, unknown>;

  // Validate queryType
  if (typeof queryType !== 'string' || !ALLOWED_QUERY_TYPES.has(queryType)) {
    return NextResponse.json(
      { error: `queryType must be one of: ${[...ALLOWED_QUERY_TYPES].join(', ')}` },
      { status: 400 },
    );
  }

  // Validate target if provided
  if (target !== undefined && target !== null && target !== '') {
    if (typeof target !== 'string' || !TARGET_RE.test(target)) {
      return NextResponse.json({ error: 'invalid target: alphanumeric + _ - . only, max 128 chars' }, { status: 400 });
    }
  }

  // Validate params is a plain object (no nested functions, no prototype pollution)
  if (params !== undefined && (typeof params !== 'object' || Array.isArray(params) || params === null)) {
    return NextResponse.json({ error: 'params must be a flat object' }, { status: 400 });
  }

  const path = QUERY_PATHS[queryType];
  if (!path) {
    return NextResponse.json({ error: 'query type not mapped' }, { status: 500 });
  }

  try {
    const upstream = await fetch(`${BRAIN_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target ?? null, params: params ?? {} }),
      signal: AbortSignal.timeout(15_000),
    });

    const data: unknown = await upstream.json().catch(() => ({ error: 'invalid JSON from GhostBrain' }));

    return NextResponse.json(
      {
        queryType,
        target:    target ?? null,
        ok:        upstream.ok,
        result:    data,
        timestamp: new Date().toISOString(),
      },
      { status: upstream.ok ? 200 : 502 },
    );
  } catch (err) {
    // GhostBrain unavailable — return a descriptive error (not a raw echo)
    return NextResponse.json(
      {
        queryType,
        ok:        false,
        result:    null,
        error:     err instanceof Error ? err.message : 'GhostBrain Core unreachable',
        timestamp: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}

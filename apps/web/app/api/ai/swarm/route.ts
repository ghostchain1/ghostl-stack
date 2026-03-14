/**
 * Portal API — /api/ai/swarm
 *
 * Aggregates swarm status from:
 *   - hyper-ghost-ai (domain specialist swarm, port 7741)
 *   - ghostbrain-core (AI orchestration swarm, port 7900)
 *
 * All data is read-only.  No mutations are performed here.
 */

import { NextResponse } from 'next/server';

const HYPER_GHOST_URL  = process.env.HYPER_GHOST_INTERNAL_URL  ?? 'http://localhost:7741';
const GHOSTBRAIN_URL   = process.env.GHOSTBRAIN_INTERNAL_URL   ?? 'http://localhost:7900';

/** Fetch with timeout; returns null on any failure (never throws). */
async function safeFetch(url: string, timeoutMs = 4000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'ghoststack-portal/1.0' },
      cache:   'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view   = searchParams.get('view') ?? 'status';   // status | events | actions
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  if (view === 'events') {
    const data = await safeFetch(`${HYPER_GHOST_URL}/swarm/events?limit=${limit}`);
    return NextResponse.json(data ?? { events: [] });
  }

  if (view === 'actions') {
    const [domainActions, brainResults] = await Promise.all([
      safeFetch(`${HYPER_GHOST_URL}/swarm/actions?limit=${limit}`),
      safeFetch(`${GHOSTBRAIN_URL}/api/v1/swarm/results?n=${limit}`),
    ]);
    return NextResponse.json({
      domain: (domainActions as Record<string, unknown> | null)?.actions ?? [],
      brain:  (brainResults as Record<string, unknown> | null)?.results ?? [],
    });
  }

  // Default: aggregate status
  const [domainStatus, brainStatus] = await Promise.all([
    safeFetch(`${HYPER_GHOST_URL}/swarm/status`),
    safeFetch(`${GHOSTBRAIN_URL}/api/v1/swarm/status`),
  ]);

  return NextResponse.json({
    domain: domainStatus,
    brain:  brainStatus,
    ok:     domainStatus !== null || brainStatus !== null,
  });
}

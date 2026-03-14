/**
 * /api/system — System health endpoint.
 *
 * Aggregates:
 *   - GAIS supervisor health (:9100/status)
 *   - GhostBrain Core health (:7900/health)
 *   - Treasury Engine health (:7683/health)
 *   - Reward Distributor health (:7684/health)
 *
 * Returns a compact summary so the devops panel can show service status at a
 * glance without proxying individual per-service fetches.
 *
 * Env vars:
 *   GAIS_URL              default http://localhost:9100
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 *   TREASURY_ENGINE_URL   default http://localhost:7683
 *   REWARD_DIST_URL       default http://localhost:7684
 */

import { NextResponse } from 'next/server';

const GAIS_URL       = process.env.GAIS_URL             ?? 'http://localhost:9100';
const BRAIN_URL      = process.env.GHOSTBRAIN_INTERNAL  ?? 'http://localhost:7900';
const TREASURY_URL   = process.env.TREASURY_ENGINE_URL  ?? 'http://localhost:7683';
const REWARD_URL     = process.env.REWARD_DIST_URL      ?? 'http://localhost:7684';

type ServiceEntry = {
  name: string;
  url:  string;
  path: string;
};

const SERVICES: ServiceEntry[] = [
  { name: 'GAIS Hypervisor',     url: GAIS_URL,     path: '/status' },
  { name: 'GhostBrain Core',     url: BRAIN_URL,    path: '/health' },
  { name: 'Treasury Engine',     url: TREASURY_URL, path: '/health' },
  { name: 'Reward Distributor',  url: REWARD_URL,   path: '/health' },
];

async function ping(svc: ServiceEntry): Promise<{ name: string; status: 'up' | 'down'; latencyMs: number; detail: unknown }> {
  const start = Date.now();
  try {
    const res = await fetch(`${svc.url}${svc.path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    const latencyMs = Date.now() - start;
    const detail = await res.json().catch(() => null);
    return { name: svc.name, status: res.ok ? 'up' : 'down', latencyMs, detail };
  } catch {
    return { name: svc.name, status: 'down', latencyMs: Date.now() - start, detail: null };
  }
}

export async function GET() {
  const results = await Promise.all(SERVICES.map(ping));
  const up   = results.filter(r => r.status === 'up').length;
  const down = results.filter(r => r.status === 'down').length;

  return NextResponse.json(
    {
      overall: down === 0 ? 'healthy' : up === 0 ? 'down' : 'degraded',
      servicesUp:   up,
      servicesDown: down,
      services:     results,
      timestamp:    new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

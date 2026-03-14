/**
 * /api/treasury/intelligence/route.ts — Aggregated treasury intelligence.
 *
 * Combines:
 *  - Treasury snapshot from treasury-engine (:7683)
 *  - AI treasury recommendations from GhostBrain (:7900)
 *  - Recent flows from treasury-engine
 */

import { NextResponse } from 'next/server';

const TREASURY_URL   = process.env['TREASURY_ENGINE_URL']  ?? 'http://localhost:7683';
const GHOSTBRAIN_URL = process.env['GHOSTBRAIN_INTERNAL']  ?? 'http://localhost:7900';

async function safeGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const [snapshot, flows, aiRecs] = await Promise.all([
    safeGet<Record<string, unknown>>(`${TREASURY_URL}/api/snapshot`),
    safeGet<{ flows?: unknown[] }>(`${TREASURY_URL}/api/flows?limit=20`),
    safeGet<{ recommendations?: unknown[] }>(`${GHOSTBRAIN_URL}/treasury/recommendations`),
  ]);

  return NextResponse.json({
    totalGst:          snapshot?.['totalGst']          ?? '—',
    availableGst:      snapshot?.['availableGst']      ?? '—',
    lockedGst:         snapshot?.['lockedGst']         ?? '—',
    burnRatePerDayGst: snapshot?.['burnRatePerDayGst'] ?? null,
    runwayDays:        snapshot?.['runwayDays']         ?? null,
    solvencyRatio:     snapshot?.['solvencyRatio']      ?? null,
    recentFlows:       flows?.flows ?? [],
    aiRecs:            aiRecs?.recommendations ?? [],
  });
}

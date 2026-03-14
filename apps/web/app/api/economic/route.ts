/**
 * Portal API — /api/economic
 *
 * Read-only proxy to the Ghost Autonomous Economic Engine (AEE) at port 7980.
 * Supports ?view=status|treasury|market|forecast|burn|validators|liquidity|yield|proposals
 *
 * No mutations — all write operations go through governance/signing relay.
 */

import { NextResponse } from 'next/server';

const AEE_URL = process.env.AEE_INTERNAL_URL ?? 'http://localhost:7980';

const VIEW_TO_PATH: Record<string, string> = {
  status:     '/status',
  treasury:   '/treasury',
  market:     '/market',
  forecast:   '/forecast',
  burn:       '/burn',
  validators: '/validators',
  liquidity:  '/liquidity',
  yield:      '/yield',
  proposals:  '/proposals/recent',
};

async function safeFetch(url: string, timeoutMs = 5000): Promise<unknown> {
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
  const view = searchParams.get('view') ?? 'status';
  const path = VIEW_TO_PATH[view] ?? '/status';

  const data = await safeFetch(`${AEE_URL}${path}`);
  if (!data) {
    return NextResponse.json({ ok: false, error: 'AEE service unavailable' }, { status: 503 });
  }
  return NextResponse.json(data);
}

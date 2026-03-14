/**
 * Portal API — /api/gni
 *
 * Proxies read-only requests to the Ghost Global Network Intelligence service.
 * Supports ?view=status|topology|forecast|regions|latency
 *
 * No mutations are performed — GNI is read-only from the portal perspective.
 */

import { NextResponse } from 'next/server';

const GNI_URL = process.env.GNI_INTERNAL_URL ?? 'http://localhost:7970';

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

  const endpoint = ['status', 'topology', 'forecast', 'regions', 'latency'].includes(view)
    ? `${GNI_URL}/${view}`
    : `${GNI_URL}/status`;

  const data = await safeFetch(endpoint);
  if (!data) {
    return NextResponse.json({ ok: false, error: 'GNI service unavailable' }, { status: 503 });
  }
  return NextResponse.json(data);
}

/**
 * Portal API — /api/security-ai
 *
 * Read-only proxy to the Ghost Sovereign Security AI (SSA) at port 7990.
 * Supports ?view=status|threats|proposals|contracts|validators|rpc|treasury|network
 *
 * No mutations — all defensive actions are advisory proposals via governance relay.
 */

import { NextResponse } from 'next/server';

const SSA_URL = process.env.SSA_INTERNAL_URL ?? 'http://localhost:7990';

const VIEW_TO_PATH: Record<string, string> = {
  status:    '/status',
  threats:   '/threats/recent',
  proposals: '/proposals/recent',
  contracts: '/contracts',
  validators:'/validators',
  rpc:       '/rpc',
  treasury:  '/treasury',
  network:   '/network',
};

async function safeFetch(url: string, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`SSA returned HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'status';

  const path = VIEW_TO_PATH[view];
  if (!path) {
    return NextResponse.json(
      { error: `Unknown view "${view}". Valid: ${Object.keys(VIEW_TO_PATH).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const data = await safeFetch(`${SSA_URL}${path}`);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status  = message.includes('abort') ? 504 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

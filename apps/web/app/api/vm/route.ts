import { NextResponse } from 'next/server';

import { loadPortalVms } from './lib';

export async function GET() {
  try {
    const payload = await loadPortalVms();
    return NextResponse.json(
      payload,
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'GAIS unreachable',
        vms: [],
        total: 0,
        running: 0,
        dryRun: false,
        source: '',
        timestamp: new Date().toISOString(),
      },
      { status: 502 },
    );
  }
}

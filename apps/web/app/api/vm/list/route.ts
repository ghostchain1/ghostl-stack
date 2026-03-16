/**
 * /api/vm/list — List VMs from the GAIS supervisor.
 *
 * Read-only; returns the current VM inventory from GAIS REST API (:9100).
 * Write actions (start/stop/reboot) go through /api/hypervisor/vm/action
 * which is gated by the kernel safety guard.
 *
 * Env vars:
 *   GAIS_URL       default http://127.0.0.1:9100
 *   GAIS_ENV_FILE  optional path to a GAIS env file for token discovery
 */

import { NextResponse } from 'next/server';
import { loadPortalVms } from '../lib';

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

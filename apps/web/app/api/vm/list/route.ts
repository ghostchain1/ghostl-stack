/**
 * /api/vm/list — List VMs from the GAIS supervisor.
 *
 * Read-only; returns the current VM inventory from GAIS REST API (:9100).
 * Write actions (start/stop/reboot) go through /api/hypervisor/vm/action
 * which is gated by the kernel safety guard.
 *
 * Env vars:
 *   GAIS_URL   default http://localhost:9100
 */

import { NextResponse } from 'next/server';

const GAIS_URL = process.env.GAIS_URL ?? 'http://localhost:9100';

export async function GET() {
  try {
    const res = await fetch(`${GAIS_URL}/vms`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GAIS returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { vms?: unknown[]; [k: string]: unknown };
    const vms  = Array.isArray(data.vms) ? data.vms : Array.isArray(data) ? data : [];

    return NextResponse.json(
      { vms, total: vms.length, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GAIS unreachable', vms: [] },
      { status: 502 },
    );
  }
}

/**
 * /api/docker/containers — List Docker containers from GAIS.
 *
 * Read-only; returns the current container inventory.
 * Write actions (start/stop/restart) go through /api/hypervisor/container/action.
 *
 * Env vars:
 *   GAIS_URL   default http://localhost:9100
 */

import { NextResponse } from 'next/server';

const GAIS_URL = process.env.GAIS_URL ?? 'http://localhost:9100';

export async function GET() {
  try {
    const res = await fetch(`${GAIS_URL}/containers`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `GAIS returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { containers?: unknown[]; [k: string]: unknown };
    const containers = Array.isArray(data.containers) ? data.containers
                     : Array.isArray(data)             ? data
                     : [];

    const running = (containers as Array<{ state?: string }>).filter(
      c => c.state === 'running',
    ).length;

    return NextResponse.json(
      {
        containers,
        total:   containers.length,
        running,
        stopped: containers.length - running,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GAIS unreachable', containers: [] },
      { status: 502 },
    );
  }
}

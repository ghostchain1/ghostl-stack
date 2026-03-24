/**
 * /api/status/services — Simplified service-health list for dashboards.
 *
 * Proxies to /api/status (the full status route) and re-formats the
 * response into the flat services[] shape expected by the monitoring
 * and employee portal pages.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Call the internal full-status route via loopback
    const base = process.env.NEXTAUTH_URL
      ?? process.env.NEXT_PUBLIC_APP_URL
      ?? 'http://localhost:3000';

    const res = await fetch(`${base}/api/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, services: [], error: `status ${res.status}` }, { status: 200 });
    }

    type FullStatus = {
      services?: Array<{
        id?: string;
        name?: string;
        url?: string;
        ok?: boolean;
        status?: string;
        latencyMs?: number;
        error?: string;
      }>;
      chains?: Array<{
        key?: string;
        rpc?: string;
        ok?: boolean;
        chainId?: string;
        blockNumber?: string;
        latencyMs?: number;
      }>;
    };

    const data = (await res.json()) as FullStatus;

    // Merge chains as pseudo-services for the monitoring view
    const chainServices = (data.chains ?? []).map((c) => ({
      id: `chain-${c.key ?? 'unknown'}`,
      name: `GhostChain ${String(c.key ?? '').toUpperCase()}`,
      category: 'chain',
      ok: c.ok ?? false,
      status: c.ok ? 'up' : 'down',
      latencyMs: c.latencyMs ?? null,
      detail: c.blockNumber ? `Block ${c.blockNumber}` : null,
    }));

    const apiServices = (data.services ?? []).map((s) => ({
      id: s.id ?? s.name ?? 'unknown',
      name: s.name ?? s.id ?? 'Unknown',
      category: 'service',
      ok: s.ok ?? false,
      status: s.ok ? 'up' : 'down',
      latencyMs: s.latencyMs ?? null,
      detail: s.error ?? null,
    }));

    const services = [...chainServices, ...apiServices];
    const healthy   = services.filter((s) => s.ok).length;
    const unhealthy = services.length - healthy;

    return NextResponse.json({ ok: true, services, healthy, unhealthy, total: services.length });
  } catch {
    return NextResponse.json({ ok: false, services: [], error: 'Status service unavailable' }, { status: 200 });
  }
}

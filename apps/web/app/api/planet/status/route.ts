import { NextResponse } from 'next/server';

const PLANET_URL =
  process.env['GHOST_PLANET_INTERNAL_URL'] ??
  process.env['GHOST_PLANET_URL'] ??
  'http://localhost:7926';

export async function GET() {
  try {
    const res = await fetch(`${PLANET_URL}/status`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned HTTP ${res.status}` },
        { status: 502 },
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    // Graceful zero-state so the dashboard renders without errors
    return NextResponse.json(
      { status: 'unavailable', message: 'GhostBrain Planet service is offline' },
      { status: 503 },
    );
  }
}

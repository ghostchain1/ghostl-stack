import { NextResponse } from 'next/server';

const REGIONAL_URL =
  process.env['GHOST_REGIONAL_INTERNAL_URL'] ??
  process.env['GHOST_REGIONAL_URL'] ??
  'http://localhost:7927';

export async function GET() {
  try {
    const res = await fetch(`${REGIONAL_URL}/status`, {
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
    return NextResponse.json(
      { status: 'unavailable', message: 'GhostBrain Regional service is offline' },
      { status: 503 },
    );
  }
}

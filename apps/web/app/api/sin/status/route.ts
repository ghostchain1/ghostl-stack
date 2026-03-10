import { NextResponse } from 'next/server';

const SIN_URL =
  process.env['GHOST_SIN_INTERNAL_URL'] ??
  process.env['GHOST_SIN_URL'] ??
  'http://localhost:7928';

export async function GET() {
  try {
    const res = await fetch(`${SIN_URL}/status`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

import { NextResponse } from 'next/server';

const MULTICHAIN_URL = process.env['MULTICHAIN_CONTROLLER_URL'] ?? 'http://localhost:7950';

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${MULTICHAIN_URL}/api/v1/status`, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'multichain controller unreachable' },
      { status: 502 }
    );
  }
}

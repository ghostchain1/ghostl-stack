import { NextResponse } from 'next/server';
import { resolveApiBase } from '../../../../src/lib/runtime';

export async function GET() {
  const base = resolveApiBase().replace(/\/+$/, '');
  try {
    const upstream = await fetch(`${base}/v1/api/revenue/l3`, { cache: 'no-store' });
    const body = await upstream.json().catch(() => ({}));
    return NextResponse.json(body, { status: upstream.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'upstream_unreachable', detail: String(error) }, { status: 502 });
  }
}

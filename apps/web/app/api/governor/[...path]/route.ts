import { NextRequest, NextResponse } from 'next/server';
import { resolveApiBase } from '../../../../src/lib/runtime';

type Context = { params: Promise<{ path?: string[] }> };

const upstreamUrl = async (ctx: Context) => {
  const params = await ctx.params;
  const suffix = (params.path || []).join('/');
  const base = resolveApiBase().replace(/\/+$/, '');
  return `${base}/v1/api/governor/${suffix}`;
};

export async function GET(_req: NextRequest, ctx: Context) {
  try {
    const url = await upstreamUrl(ctx);
    const upstream = await fetch(url, { cache: 'no-store' });
    const body = await upstream.json().catch(() => ({}));
    return NextResponse.json(body, { status: upstream.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'upstream_unreachable', detail: String(error) }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: Context) {
  try {
    const url = await upstreamUrl(ctx);
    const body = await req.json().catch(() => ({}));
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(req.headers.get('x-admin-token') ? { 'x-admin-token': String(req.headers.get('x-admin-token')) } : {})
      },
      body: JSON.stringify(body)
    });
    const response = await upstream.json().catch(() => ({}));
    return NextResponse.json(response, { status: upstream.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'upstream_unreachable', detail: String(error) }, { status: 502 });
  }
}

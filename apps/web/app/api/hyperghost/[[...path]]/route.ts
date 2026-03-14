import { NextResponse, type NextRequest } from 'next/server';

const resolveBase = () => {
  const value = process.env.HYPERGHOST_INTERNAL_URL || '';
  const fallback = 'http://127.0.0.1:7077';
  return (value || fallback).replace(/\/+$/, '');
};

const forwardHeaders = (request: NextRequest) => {
  const headers = new Headers();
  const passthrough = ['content-type', 'accept', 'authorization', 'x-hgop-approval-token', 'x-approval-token'];
  for (const key of passthrough) {
    const v = request.headers.get(key);
    if (v) headers.set(key, v);
  }
  return headers;
};

const buildResponse = async (upstream: Response) => {
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, { status: upstream.status, headers });
};

async function proxy(request: NextRequest, params: { path?: string[] }) {
  const base = resolveBase();
  const tail = params.path?.length ? `/${params.path.join('/')}` : '/status';
  if (tail.includes('..')) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 });
  }

  const url = new URL(`${base}${tail}`);
  url.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(method)) {
    return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: forwardHeaders(request),
      body,
      cache: 'no-store'
    });
    return buildResponse(upstream);
  } catch (error) {
    return NextResponse.json({ error: 'upstream_unreachable', detail: String(error) }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxy(request, params);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxy(request, params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  return proxy(request, params);
}


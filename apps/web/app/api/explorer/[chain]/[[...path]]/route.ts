import { NextResponse, type NextRequest } from 'next/server';

type ChainKey = 'l1' | 'l2' | 'l3';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization'
};

const chainBases: Record<ChainKey, { internal?: string; public?: string }> = {
  l1: { internal: process.env.GHOSTSCOUT_L1_INTERNAL, public: process.env.NEXT_PUBLIC_GHOSTSCOUT_L1_URL },
  l2: { internal: process.env.GHOSTSCOUT_L2_INTERNAL, public: process.env.NEXT_PUBLIC_GHOSTSCOUT_L2_URL },
  l3: { internal: process.env.GHOSTSCOUT_L3_INTERNAL, public: process.env.NEXT_PUBLIC_GHOSTSCOUT_L3_URL }
};

const resolveBase = (chain: ChainKey) => {
  const value = chainBases[chain]?.internal || chainBases[chain]?.public || '';
  return value.replace(/\/+$/, '');
};

const resolveTargetPath = (segments: string[]) => {
  if (segments.length === 0) {
    return '/api/v2/stats';
  }
  const [head, ...tail] = segments;
  const suffix = tail.length ? `/${tail.join('/')}` : '';
  switch (head.toLowerCase()) {
    case 'stats':
      return `/api/v2/stats${suffix}`;
    case 'blocks':
      return `/api/v2/blocks${suffix}`;
    case 'transactions':
    case 'txs':
      return `/api/v2/transactions${suffix}`;
    case 'addresses':
      return `/api/v2/addresses${suffix}`;
    case 'contracts':
      return `/api/v2/smart-contracts${suffix}`;
    case 'api':
      return `/${[head, ...tail].join('/')}`;
    default:
      return '';
  }
};

const forwardHeaders = (request: NextRequest) => {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  return headers;
};

const buildResponse = async (upstream: Response) => {
  const headers = new Headers(corsHeaders);
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) headers.set('cache-control', cacheControl);
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, { status: upstream.status, headers });
};

async function proxy(request: NextRequest, params: { chain: string; path?: string[] }) {
  const chain = params.chain as ChainKey;
  if (!chainBases[chain]) {
    return NextResponse.json({ error: 'invalid_chain' }, { status: 400, headers: corsHeaders });
  }
  const base = resolveBase(chain);
  if (!base) {
    return NextResponse.json({ error: 'missing_base_url' }, { status: 500, headers: corsHeaders });
  }
  const targetPath = resolveTargetPath(params.path ?? []);
  if (!targetPath) {
    return NextResponse.json({ error: 'unsupported_endpoint' }, { status: 400, headers: corsHeaders });
  }

  const url = new URL(`${base}${targetPath}`);
  url.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    return NextResponse.json({ error: 'method_not_allowed' }, { status: 405, headers: corsHeaders });
  }

  const body = method === 'GET' ? undefined : await request.arrayBuffer();
  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: forwardHeaders(request),
      body,
      cache: 'no-store'
    });
    return buildResponse(upstream);
  } catch (error) {
    return NextResponse.json({ error: 'upstream_unreachable', detail: String(error) }, { status: 502, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest, context: { params: Promise<{ chain: string; path?: string[] }> }) {
  const params = await context.params;
  return proxy(request, params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ chain: string; path?: string[] }> }) {
  const params = await context.params;
  return proxy(request, params);
}

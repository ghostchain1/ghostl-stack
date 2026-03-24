import { NextResponse, type NextRequest } from 'next/server';

type ChainKey = 'l1' | 'l2' | 'l3';

// ── RPC fallback ─────────────────────────────────────────────────────────────
const CHAIN_RPC: Record<ChainKey, string> = {
  l1: process.env.L1_RPC_URL ?? 'http://localhost:18545',
  l2: process.env.L2_RPC_URL ?? 'http://localhost:29545',
  l3: process.env.L3_RPC_URL ?? 'http://localhost:39545',
};
const CHAIN_IDS: Record<ChainKey, string> = { l1: '14000101', l2: '901', l3: '903' };
const CHAIN_NAMES: Record<ChainKey, string> = { l1: 'GhostChain L1', l2: 'GhostL2', l3: 'GhostL3' };

async function jsonRpc(chain: ChainKey, method: string, params: unknown[] = []) {
  const res = await fetch(CHAIN_RPC[chain], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(4_000),
  });
  const j = (await res.json()) as { result?: unknown };
  return j.result ?? null;
}

type RpcBlock = { number: string; hash: string; timestamp: string; transactions: unknown[]; gasUsed: string; gasLimit: string; miner: string; size?: string };

async function rpcBlocks(chain: ChainKey, limit: number): Promise<unknown> {
  const latestHex = await jsonRpc(chain, 'eth_blockNumber') as string;
  const latest = parseInt(latestHex, 16);
  const nums = Array.from({ length: Math.min(limit, 50) }, (_, i) => Math.max(0, latest - i));
  const raw = await Promise.all(nums.map(n => jsonRpc(chain, 'eth_getBlockByNumber', [`0x${n.toString(16)}`, false]).catch(() => null)));
  const blocks = raw.filter(Boolean) as RpcBlock[];
  return blocks.map(b => ({
    number: parseInt(b.number, 16),
    hash: b.hash,
    timestamp: new Date(parseInt(b.timestamp, 16) * 1000).toISOString(),
    txCount: Array.isArray(b.transactions) ? b.transactions.length : 0,
    gasUsed: b.gasUsed,
    gasLimit: b.gasLimit,
    miner: b.miner,
    chain: CHAIN_NAMES[chain],
    chainId: CHAIN_IDS[chain],
  }));
}

async function rpcSearch(chain: ChainKey, q: string): Promise<unknown> {
  const trimmed = q.trim();
  // Block number
  if (/^\d+$/.test(trimmed)) {
    const hex = `0x${parseInt(trimmed, 10).toString(16)}`;
    const block = await jsonRpc(chain, 'eth_getBlockByNumber', [hex, false]).catch(() => null);
    if (block) return { type: 'block', data: block };
  }
  // Tx hash
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    const tx = await jsonRpc(chain, 'eth_getTransactionByHash', [trimmed]).catch(() => null);
    if (tx) return { type: 'tx', data: tx };
    const block = await jsonRpc(chain, 'eth_getBlockByHash', [trimmed, false]).catch(() => null);
    if (block) return { type: 'block', data: block };
  }
  // Address
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    const balance = await jsonRpc(chain, 'eth_getBalance', [trimmed, 'latest']).catch(() => null);
    return { type: 'address', data: { address: trimmed, balance } };
  }
  return { type: 'unknown', data: null };
}

async function rpcTxs(chain: ChainKey, limit: number): Promise<unknown> {
  const latestHex = await jsonRpc(chain, 'eth_blockNumber') as string;
  const latest = parseInt(latestHex, 16);
  const nums = Array.from({ length: Math.min(limit, 10) }, (_, i) => Math.max(0, latest - i));
  const rawBlocks = await Promise.all(nums.map(n => jsonRpc(chain, 'eth_getBlockByNumber', [`0x${n.toString(16)}`, true]).catch(() => null)));
  const txs: unknown[] = [];
  for (const b of rawBlocks) {
    if (!b || typeof b !== 'object') continue;
    const block = b as { transactions?: unknown[]; number?: string; timestamp?: string };
    const blockNum = block.number ? parseInt(block.number, 16) : 0;
    const ts = block.timestamp ? new Date(parseInt(block.timestamp, 16) * 1000).toISOString() : '';
    for (const tx of (block.transactions ?? [])) {
      if (typeof tx === 'object' && tx !== null) {
        txs.push({ ...(tx as object), blockNumber: blockNum, timestamp: ts, chain: CHAIN_NAMES[chain] });
      }
      if (txs.length >= limit) break;
    }
    if (txs.length >= limit) break;
  }
  return txs;
}

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
    case 'search':
      return `/api/v2/search${suffix}`;
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

  const segments = params.path ?? [];
  const firstSegment = (segments[0] ?? '').toLowerCase();
  const base = resolveBase(chain);
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? request.nextUrl.searchParams.get('count') ?? '20');

  // ── RPC fallback when GhostScan is not configured ────────────────────────
  if (!base) {
    try {
      if (firstSegment === 'blocks' || segments.length === 0) {
        const data = await rpcBlocks(chain, Math.min(limit, 50));
        return NextResponse.json({ blocks: data }, { headers: corsHeaders });
      }
      if (firstSegment === 'txs' || firstSegment === 'transactions') {
        const data = await rpcTxs(chain, Math.min(limit, 50));
        return NextResponse.json({ txs: data, transactions: data }, { headers: corsHeaders });
      }
      if (firstSegment === 'search') {
        const q = request.nextUrl.searchParams.get('q') ?? '';
        if (!q) return NextResponse.json({ error: 'q param required' }, { status: 400, headers: corsHeaders });
        const data = await rpcSearch(chain, q);
        return NextResponse.json(data, { headers: corsHeaders });
      }
      return NextResponse.json({ error: 'missing_base_url' }, { status: 500, headers: corsHeaders });
    } catch (err) {
      return NextResponse.json({ error: 'rpc_error', detail: String(err) }, { status: 502, headers: corsHeaders });
    }
  }

  const targetPath = resolveTargetPath(segments);
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
    // GhostScan unreachable — try RPC fallback for common endpoints
    try {
      if (firstSegment === 'blocks') {
        const data = await rpcBlocks(chain, Math.min(limit, 50));
        return NextResponse.json({ blocks: data }, { headers: corsHeaders });
      }
      if (firstSegment === 'txs' || firstSegment === 'transactions') {
        const data = await rpcTxs(chain, Math.min(limit, 50));
        return NextResponse.json({ txs: data, transactions: data }, { headers: corsHeaders });
      }
      if (firstSegment === 'search') {
        const q = request.nextUrl.searchParams.get('q') ?? '';
        if (q) {
          const data = await rpcSearch(chain, q);
          return NextResponse.json(data, { headers: corsHeaders });
        }
      }
    } catch {/* ignore RPC fallback error */}
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

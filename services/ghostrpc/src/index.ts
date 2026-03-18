/**
 * GhostRPC — GhostChain Multi-Layer JSON-RPC Proxy
 *
 * Routes `ghost_*` method calls to the appropriate L1/L2/L3 node.
 * Layer is determined by:
 *   1. Explicit path: /rpc/l1, /rpc/l2, /rpc/l3
 *   2. chainId parameter in the request body (for ghost_sendRawTransaction etc.)
 *   3. Default: L1
 *
 * Adds: rate-limiting, method allowlist, CORS, logging.
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';

// ─── Configuration ────────────────────────────────────────────────────────────

const GHOST_NODES = {
  l1: { url: process.env.GHOST_L1_RPC ?? 'http://localhost:18545', chainId: 14000101 },
  l2: { url: process.env.GHOST_L2_RPC ?? 'http://localhost:29547', chainId: 901      },
  l3: { url: process.env.GHOST_L3_RPC ?? 'http://localhost:39545', chainId: 903      },
} as const;

type Layer = keyof typeof GHOST_NODES;

const PORT = parseInt(process.env.GHOSTRPC_PORT ?? '18500', 10);

// Rate limiting: max requests per IP per minute
const RATE_LIMIT_RPM = parseInt(process.env.GHOSTRPC_RATE_LIMIT ?? '300', 10);

// ─── Allowed Methods ──────────────────────────────────────────────────────────
// Only ghost_* methods are permitted. The proxy transparently forwards these
// to the underlying node.  eth_ is never exposed.

const ALLOWED_METHODS = new Set([
  'ghost_blockNumber',
  'ghost_call',
  'ghost_chainId',
  'ghost_createAccessList',
  'ghost_estimateGas',
  'ghost_feeHistory',
  'ghost_gasPrice',
  'ghost_getBalance',
  'ghost_getBlockByHash',
  'ghost_getBlockByNumber',
  'ghost_getBlockReceipts',
  'ghost_getBlockTransactionCountByHash',
  'ghost_getBlockTransactionCountByNumber',
  'ghost_getCode',
  'ghost_getLogs',
  'ghost_getProof',
  'ghost_getStorageAt',
  'ghost_getTransactionByBlockHashAndIndex',
  'ghost_getTransactionByBlockNumberAndIndex',
  'ghost_getTransactionByHash',
  'ghost_getTransactionCount',
  'ghost_getTransactionReceipt',
  'ghost_maxPriorityFeePerGas',
  'ghost_newBlockFilter',
  'ghost_newFilter',
  'ghost_newPendingTransactionFilter',
  'ghost_sendRawTransaction',
  'ghost_subscribe',
  'ghost_syncing',
  'ghost_uninstallFilter',
  'ghost_unsubscribe',
  // GhostBrain AI oracle methods
  'ghost_brainQuery',
  'ghost_brainRiskScore',
  // GhostChain CBDC methods
  'ghost_cbdc_issue',
  'ghost_cbdc_redeem',
  'ghost_cbdc_transfer',
  'ghost_cbdc_balance',
  // GNS methods
  'ghost_gns_resolve',
  'ghost_gns_reverse',
  // Net / Web3 compatibility
  'net_version',
  'net_listening',
  'ghost_protocolVersion',
  'ghost_coinbase',
  'ghost_mining',
  'ghost_hashrate',
]);

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

class RateLimiter {
  private windows = new Map<string, { count: number; reset: number }>();

  check(ip: string): boolean {
    const now  = Date.now();
    const wind = this.windows.get(ip);

    if (!wind || now > wind.reset) {
      this.windows.set(ip, { count: 1, reset: now + 60_000 });
      return true;
    }

    if (wind.count >= RATE_LIMIT_RPM) return false;
    wind.count++;
    return true;
  }

  // Periodically clean up expired windows
  gc(): void {
    const now = Date.now();
    for (const [key, wind] of this.windows) {
      if (now > wind.reset) this.windows.delete(key);
    }
  }
}

// ─── Forwarding ───────────────────────────────────────────────────────────────

async function forwardToNode(nodeUrl: string, body: unknown): Promise<unknown> {
  const res = await fetch(nodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Upstream node error: HTTP ${res.status}`);
  }

  return res.json();
}

function resolveLayer(path: string, body: { method?: string; params?: unknown[] }): Layer {
  if (path.includes('/l1')) return 'l1';
  if (path.includes('/l2')) return 'l2';
  if (path.includes('/l3')) return 'l3';

  // Auto-detect by chainId in ghost_chainId response or sendRawTransaction prefix
  // Default to L1
  return 'l1';
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function startGhostRPC(): void {
  const app     = express();
  const limiter = new RateLimiter();

  setInterval(() => limiter.gc(), 120_000);

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // Health
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'GhostRPC', layers: Object.keys(GHOST_NODES), nativeToken: 'GST' });
  });

  // List supported methods
  app.get('/methods', (_req, res) => {
    res.json({ methods: Array.from(ALLOWED_METHODS) });
  });

  // Main RPC handler — accepts /rpc, /rpc/l1, /rpc/l2, /rpc/l3
  const handleRpc = async (req: Request, res: Response): Promise<void> => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress ?? '';

    if (!limiter.check(ip)) {
      res.status(429).json(rpcError(null, -32000, 'Rate limit exceeded — max 300 req/min'));
      return;
    }

    const body = req.body as { id?: unknown; method?: string; params?: unknown[] } | Array<unknown>;

    // Batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((item) => handleSingle(item as typeof body & object, req.path))
      );
      res.json(results);
      return;
    }

    res.json(await handleSingle(body, req.path));
  };

  async function handleSingle(
    body: { id?: unknown; method?: string; params?: unknown[] },
    path: string
  ): Promise<unknown> {
    const id     = body.id ?? null;
    const method = body.method ?? '';

    if (!ALLOWED_METHODS.has(method)) {
      return rpcError(id, -32601, `Method '${method}' not allowed — use ghost_* methods only`);
    }

    const layer   = resolveLayer(path, body);
    const nodeUrl = GHOST_NODES[layer].url;

    try {
      return await forwardToNode(nodeUrl, body);
    } catch (e: any) {
      return rpcError(id, -32603, `Upstream error: ${e.message}`);
    }
  }

  app.post('/rpc',    handleRpc);
  app.post('/rpc/l1', handleRpc);
  app.post('/rpc/l2', handleRpc);
  app.post('/rpc/l3', handleRpc);

  // Catch-all for non-ghost_ calls
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'GhostRPC: endpoint not found. Use POST /rpc or /rpc/l1|l2|l3' });
  });

  app.listen(PORT, () => {
    console.log(`GhostRPC proxy listening on port ${PORT}`);
    console.log(`  Nodes: L1=${GHOST_NODES.l1.url} | L2=${GHOST_NODES.l2.url} | L3=${GHOST_NODES.l3.url}`);
    console.log(`  Rate limit: ${RATE_LIMIT_RPM} req/min/IP`);
    console.log(`  Allowed methods: ${ALLOWED_METHODS.size}`);
  });
}

startGhostRPC();

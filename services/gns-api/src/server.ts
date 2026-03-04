/**
 * gns-api — Ghost Name Service public + internal REST API
 *
 * Public endpoints:
 *   GET  /resolve/:name           → address + resolver + expiry
 *   GET  /dns/:name               → A / AAAA records
 *   GET  /owner/:address          → Names owned by address
 *   GET  /validator               → Validator namespace names
 *   GET  /dao                     → DAO namespace names
 *   POST /renew                   → Renewal hook (GST fee check)
 *
 * Internal endpoints (not exposed externally):
 *   POST /internal/dns/sync       → Trigger Bind9 DDNS update for a node
 *   POST /internal/dhcp/update    → Record IP binding from Kea
 *   GET  /health                  → Health probe
 *   GET  /metrics                 → Prometheus metrics
 *
 * Routing law: API is read-only toward L1; all writes go through L3→L2→L1.
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { Pool }    from 'pg';
import pino        from 'pino';
import pinoHttp    from 'pino-http';
import { ethers }  from 'ethers';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT           = Number(process.env.PORT || 3000);
const LOG_LEVEL      = process.env.LOG_LEVEL    || 'info';
const DATABASE_URL   = process.env.DATABASE_URL || '';
const INDEXER_URL    = process.env.INDEXER_URL  || 'http://gns-indexer:8080';
const BIND9_RNDC_URL = process.env.BIND9_RNDC_URL || ''; // optional
const KEA_CTRL_URL   = process.env.KEA_CTRL_URL || 'http://gns-kea:8000';
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 60);
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || '';
const L1_RPC_URL     = process.env.L1_RPC_URL   || '';
const GNS_REGISTRY   = process.env.GNS_REGISTRY_ADDRESS || '';
const GNS_RESOLVER   = process.env.GNS_RESOLVER_ADDRESS || '';

// ── Logger ────────────────────────────────────────────────────────────────────
const log = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } }
});

// ── Registry ABI (read-only GNSResolver view calls) ──────────────────────────
const RESOLVER_ABI = [
  'function addr(bytes32 node) view returns (address)',
  'function text(bytes32 node, string key) view returns (string)',
  'function contenthash(bytes32 node) view returns (bytes)',
];

const REGISTRY_ABI = [
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
  'function expiry(bytes32 node) view returns (uint64)',
  'function isExpired(bytes32 node) view returns (bool)',
  'function nodeOf(string label) view returns (bytes32)',
  'function GHOST_ROOT() view returns (bytes32)',
];

// ── DB pool ───────────────────────────────────────────────────────────────────
let db: Pool | null = null;
let ethProvider: ethers.JsonRpcProvider | null = null;
let registryContract: ethers.Contract | null   = null;
let resolverContract:  ethers.Contract | null  = null;

function getDb(): Pool {
  if (!db) {
    db = new Pool({ connectionString: DATABASE_URL, max: 10 });
    db.on('error', (err) => log.error({ err }, 'pg pool error'));
  }
  return db;
}

function getProvider(): ethers.JsonRpcProvider {
  if (!ethProvider) ethProvider = new ethers.JsonRpcProvider(L1_RPC_URL);
  return ethProvider;
}

function getRegistry(): ethers.Contract { 
  if (!registryContract) registryContract = new ethers.Contract(GNS_REGISTRY, REGISTRY_ABI, getProvider());
  return registryContract;
}

function getResolver(): ethers.Contract {
  if (!resolverContract) resolverContract = new ethers.Contract(GNS_RESOLVER, RESOLVER_ABI, getProvider());
  return resolverContract;
}

// ── Namehash ──────────────────────────────────────────────────────────────────
function namehash(name: string): string {
  let node = '0x' + '00'.repeat(32);
  if (name === '') return node;
  const labels = name.split('.').reverse();
  for (const label of labels) {
    const lhex  = ethers.keccak256(ethers.toUtf8Bytes(label));
    node = ethers.keccak256(ethers.concat([node, lhex]));
  }
  return node;
}

// ── Rate limiting (simple in-memory sliding window) ──────────────────────────
const rateLimits = new Map<string, { count: number; windowStart: number }>();

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip  = String(req.ip || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const win = 60_000; // 1 minute window
  const entry = rateLimits.get(ip) ?? { count: 0, windowStart: now };

  if (now - entry.windowStart > win) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimits.set(ip, entry);

  if (entry.count > RATE_LIMIT_RPM) {
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return;
  }
  next();
}

// Internal auth middleware
function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-internal-token'] ?? req.headers['authorization']?.replace('Bearer ', '');
  if (INTERNAL_TOKEN && token !== INTERNAL_TOKEN) {
    res.status(401).json({ error: 'unauthorised' });
    return;
  }
  next();
}

// ── Metrics ───────────────────────────────────────────────────────────────────
const metrics = { resolves: 0, errors: 0, dnsSyncs: 0, dhcpUpdates: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resolveFromChain(name: string): Promise<{
  node: string; owner: string; addr: string; expiry: number; expired: boolean;
} | null> {
  try {
    const reg  = getRegistry();
    const res  = getResolver();
    const node = namehash(name);

    const [owner, expiry, expired, addr] = await Promise.all([
      reg.owner(node)   as Promise<string>,
      reg.expiry(node)  as Promise<bigint>,
      reg.isExpired(node) as Promise<boolean>,
      res.addr(node)    as Promise<string>,
    ]);

    return {
      node,
      owner:   owner.toLowerCase(),
      addr:    addr.toLowerCase(),
      expiry:  Number(expiry),
      expired,
    };
  } catch {
    return null;
  }
}

async function dbLookupName(nameOrNode: string): Promise<Record<string, unknown> | null> {
  if (!DATABASE_URL) return null;
  try {
    const pool  = getDb();
    const field = nameOrNode.startsWith('0x') ? 'node' : 'label';
    const res   = await pool.query(
      `SELECT node, label, owner, resolver, expiry_ts, locked, last_tx, updated_at
       FROM gns_names WHERE ${field} = $1`,
      [nameOrNode]
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

// ── DNS sync (triggers Bind9 update via RNDC or dynamic update) ──────────────
async function triggerDnsSync(node: string, name?: string, address?: string): Promise<void> {
  metrics.dnsSyncs += 1;
  log.info({ node, name, address }, 'dns sync triggered');

  // If KEA ctrl-agent is configured and we have an IP, add a DNS record
  // via Kea's DDNS mechanism (preferred in production).
  // Fallback: direct RNDC call to Bind9 via internal endpoint.
  if (BIND9_RNDC_URL && name && address) {
    try {
      await fetch(`${BIND9_RNDC_URL}/update`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ name, address, ttl: 300 }),
      });
    } catch (err) {
      log.warn({ err }, 'bind9 rndc update failed');
    }
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(pinoHttp({ logger: log }) as express.RequestHandler);
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'gns-api', ...metrics });
});

// ── Prometheus metrics ────────────────────────────────────────────────────────
app.get('/metrics', (_req: Request, res: Response) => {
  res.type('text/plain').send([
    `gns_api_resolves_total ${metrics.resolves}`,
    `gns_api_errors_total ${metrics.errors}`,
    `gns_api_dns_syncs_total ${metrics.dnsSyncs}`,
    `gns_api_dhcp_updates_total ${metrics.dhcpUpdates}`,
  ].join('\n'));
});

// ── Public: resolve name → address ───────────────────────────────────────────
app.get('/resolve/:name', rateLimitMiddleware, async (req: Request, res: Response) => {
  const { name } = req.params;
  metrics.resolves += 1;

  try {
    // Try DB cache first (fast path)
    const dbRow = await dbLookupName(name);

    if (L1_RPC_URL && GNS_REGISTRY && GNS_RESOLVER) {
      // Authoritative chain read
      const chain = await resolveFromChain(name);
      if (!chain) return void res.status(404).json({ error: 'not_found' });
      if (chain.expired) return void res.status(410).json({ error: 'expired' });
      return void res.json({ name, ...chain, source: 'chain' });
    }

    if (dbRow) return void res.json({ name, ...dbRow, source: 'index' });
    res.status(404).json({ error: 'not_found' });
  } catch (err) {
    metrics.errors += 1;
    log.error({ err, name }, 'resolve error');
    res.status(500).json({ error: 'internal' });
  }
});

// ── Public: DNS A-record style lookup ────────────────────────────────────────
app.get('/dns/:name', rateLimitMiddleware, async (req: Request, res: Response) => {
  const { name } = req.params;
  try {
    const dbRow = await dbLookupName(name);
    if (!dbRow) return void res.status(404).json({ error: 'nxdomain' });

    // Try to get IPv4 from text record "ip" or return resolver address
    const records: { type: string; value: string; ttl: number }[] = [];

    if (dbRow['ip'] as string | undefined) {
      records.push({ type: 'A', value: dbRow['ip'] as string, ttl: 300 });
    }
    if (dbRow['ipv6'] as string | undefined) {
      records.push({ type: 'AAAA', value: dbRow['ipv6'] as string, ttl: 300 });
    }

    res.json({ name, records });
  } catch (err) {
    metrics.errors += 1;
    log.error({ err }, 'dns lookup error');
    res.status(500).json({ error: 'internal' });
  }
});

// ── Public: names by owner ────────────────────────────────────────────────────
app.get('/owner/:address', rateLimitMiddleware, async (req: Request, res: Response) => {
  const { address } = req.params;
  try {
    if (!DATABASE_URL) {
      return void res.status(503).json({ error: 'db_not_available' });
    }
    const result = await getDb().query(
      `SELECT node, label, expiry_ts, locked FROM gns_names
       WHERE owner = $1 ORDER BY updated_at DESC LIMIT 100`,
      [address.toLowerCase()]
    );
    res.json({ address, names: result.rows });
  } catch (err) {
    metrics.errors += 1;
    log.error({ err }, 'owner lookup error');
    res.status(500).json({ error: 'internal' });
  }
});

// ── Public: validator namespace ───────────────────────────────────────────────
app.get('/validator', rateLimitMiddleware, async (_req: Request, res: Response) => {
  try {
    if (!DATABASE_URL) return void res.status(503).json({ error: 'db_not_available' });
    const result = await getDb().query(
      `SELECT gn.node, gn.label, gn.owner, gvb.validator_id, gvb.staking_address
       FROM gns_names gn
       LEFT JOIN gns_validator_bindings gvb ON gn.node = gvb.node
       WHERE gn.label LIKE '%.validator'
       ORDER BY gvb.validator_id`
    );
    res.json({ validators: result.rows });
  } catch (err) {
    metrics.errors += 1;
    res.status(500).json({ error: 'internal' });
  }
});

// ── Public: DAO namespace ─────────────────────────────────────────────────────
app.get('/dao', rateLimitMiddleware, async (_req: Request, res: Response) => {
  try {
    if (!DATABASE_URL) return void res.status(503).json({ error: 'db_not_available' });
    const result = await getDb().query(
      `SELECT node, label, owner, expiry_ts FROM gns_names
       WHERE label LIKE '%.dao' OR label LIKE '%.dao.ghost'
       ORDER BY label`
    );
    res.json({ daoNames: result.rows });
  } catch (err) {
    metrics.errors += 1;
    res.status(500).json({ error: 'internal' });
  }
});

// ── Internal: DNS sync trigger (from indexer) ─────────────────────────────────
app.post('/internal/dns/sync', internalAuth, async (req: Request, res: Response) => {
  const { node, name, address } = req.body as { node?: string; name?: string; address?: string };
  if (!node) return void res.status(400).json({ error: 'node_required' });

  try {
    await triggerDnsSync(node, name, address);
    res.json({ ok: true, node });
  } catch (err) {
    log.error({ err }, 'dns sync error');
    res.status(500).json({ error: 'internal' });
  }
});

// ── Internal: DHCP/IP binding (from Kea hook or admin) ───────────────────────
app.post('/internal/dhcp/update', internalAuth, async (req: Request, res: Response) => {
  const { hostname, ip, mac } = req.body as { hostname: string; ip: string; mac?: string };
  if (!hostname || !ip) return void res.status(400).json({ error: 'hostname_and_ip_required' });

  metrics.dhcpUpdates += 1;
  log.info({ hostname, ip, mac }, 'dhcp update');

  try {
    if (DATABASE_URL) {
      await getDb().query(`
        INSERT INTO gns_dhcp_leases (hostname, ip, mac, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (hostname) DO UPDATE SET ip = $2, mac = $3, updated_at = NOW()
      `, [hostname, ip, mac ?? null]);

      // Also update name record if it matches a GNS name
      await getDb().query(`
        UPDATE gns_names SET ip = $1, updated_at = NOW() WHERE label = $2
      `, [ip, hostname]);
    }

    // Trigger DNS update for the hostname
    await triggerDnsSync('', hostname, ip);
    res.json({ ok: true, hostname, ip });
  } catch (err) {
    log.error({ err }, 'dhcp update error');
    res.status(500).json({ error: 'internal' });
  }
});

// ── Internal: Kea ctrl-agent proxy (add/remove lease) ────────────────────────
app.post('/internal/kea/:command', internalAuth, async (req: Request, res: Response) => {
  const { command } = req.params;
  try {
    const keaRes = await fetch(KEA_CTRL_URL, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ command, ...req.body }),
    });
    const data = await keaRes.json();
    res.json(data);
  } catch (err) {
    log.error({ err, command }, 'kea proxy error');
    res.status(502).json({ error: 'kea_unavailable' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log.info({ port: PORT }, 'gns-api starting');

  if (DATABASE_URL) {
    try {
      await getDb().query('SELECT 1');
      log.info('PostgreSQL connected');
    } catch (err) {
      log.warn({ err }, 'PostgreSQL not ready (degraded mode)');
    }
  }

  app.listen(PORT, () => log.info({ port: PORT }, 'gns-api ready'));
}

main().catch((err) => {
  log.fatal({ err }, 'fatal startup error');
  process.exit(1);
});

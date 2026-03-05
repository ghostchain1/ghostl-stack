/**
 * gns-indexer — Ghost Name Service L1 event indexer
 *
 * Watches GNSRegistry on GhostChain L1 and syncs:
 *   NameRegistered | NameRenewed | ResolverSet | OwnershipTransferred | NameLocked
 *
 * into PostgreSQL, then enqueues DNS-sync jobs for consumed records.
 *
 * Routing law: L1 is canonical root. Indexer is read-only from L1's perspective.
 */

import express, { type Request, type Response } from 'express';
import { ghost }    from 'ghost';
import { Pool }      from 'pg';
import pino          from 'pino';
import pinoHttp      from 'pino-http';

// ── Config ───────────────────────────────────────────────────────────────────
const PORT             = Number(process.env.PORT || 8080);
const LOG_LEVEL        = process.env.LOG_LEVEL    || 'info';
const DATABASE_URL     = process.env.DATABASE_URL || '';
const L1_RPC_URL       = process.env.L1_RPC_URL   || 'http://localhost:8545';
const GNS_REGISTRY_ADDR= process.env.GNS_REGISTRY_ADDRESS || '';
const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.POLL_INTERVAL_MS || 12_000));
const CONFIRM_BLOCKS   = Number(process.env.CONFIRM_BLOCKS || 2);
const GNS_API_URL      = process.env.GNS_API_URL  || 'http://gns-api:3000';

// ── Logger ───────────────────────────────────────────────────────────────────
const log = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } }
});

// ── ABI (minimal — GNSRegistry events only) ───────────────────────────────────
const GNS_REGISTRY_ABI = [
  'event NameRegistered(bytes32 indexed node, string label, address owner, uint64 expiry)',
  'event NameRenewed(bytes32 indexed node, uint64 newExpiry)',
  'event ResolverSet(bytes32 indexed node, address resolver)',
  'event OwnershipTransferred(bytes32 indexed node, address newOwner)',
  'event NameLocked(bytes32 indexed node)',
];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  lastBlock:     0,
  syncRuns:      0,
  syncErrors:    0,
  lastSyncAt:    null as string | null,
  connected:     false,
};

// ── DB pool ───────────────────────────────────────────────────────────────────
let db: Pool | null = null;

function getDb(): Pool {
  if (!db) {
    db = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    db.on('error', (err) => log.error({ err }, 'pg pool error'));
  }
  return db;
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function upsertName(opts: {
  node:     string;
  label?:   string;
  owner?:   string;
  resolver?:string;
  expiry?:  bigint;
  locked?:  boolean;
  txHash?:  string;
  blockNum? :number;
}): Promise<void> {
  const pool = getDb();
  await pool.query(`
    INSERT INTO gns_names (node, label, owner, resolver, expiry_ts, locked, last_tx, last_block, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (node) DO UPDATE SET
      label      = COALESCE(EXCLUDED.label,    gns_names.label),
      owner      = COALESCE(EXCLUDED.owner,    gns_names.owner),
      resolver   = COALESCE(EXCLUDED.resolver, gns_names.resolver),
      expiry_ts  = COALESCE(EXCLUDED.expiry_ts,gns_names.expiry_ts),
      locked     = COALESCE(EXCLUDED.locked,   gns_names.locked),
      last_tx    = COALESCE(EXCLUDED.last_tx,  gns_names.last_tx),
      last_block = COALESCE(EXCLUDED.last_block,gns_names.last_block),
      updated_at = NOW()
  `, [
    opts.node,
    opts.label    ?? null,
    opts.owner    ?? null,
    opts.resolver ?? null,
    opts.expiry   != null ? new Date(Number(opts.expiry) * 1000).toISOString() : null,
    opts.locked   ?? null,
    opts.txHash   ?? null,
    opts.blockNum ?? null,
  ]);
}

async function saveIndexerState(blockNum: number): Promise<void> {
  const pool = getDb();
  await pool.query(`
    INSERT INTO gns_indexer_state (id, last_block, updated_at)
    VALUES (1, $1, NOW())
    ON CONFLICT (id) DO UPDATE SET last_block = $1, updated_at = NOW()
  `, [blockNum]);
}

async function loadIndexerState(): Promise<number> {
  try {
    const pool = getDb();
    const res  = await pool.query(`SELECT last_block FROM gns_indexer_state WHERE id = 1`);
    return res.rows[0]?.last_block ?? 0;
  } catch {
    return 0;
  }
}

// ── Notify API to sync DNS ────────────────────────────────────────────────────
async function notifyDnsSync(node: string): Promise<void> {
  try {
    await fetch(`${GNS_API_URL}/internal/dns/sync`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ node }),
    });
  } catch (err) {
    log.warn({ err, node }, 'dns sync notify failed (non-fatal)');
  }
}

// ── Event processing ──────────────────────────────────────────────────────────
async function processLogs(
  contract: ghost.Contract,
  fromBlock: number,
  toBlock:   number,
): Promise<void> {
  // NameRegistered
  const registered = await contract.queryFilter(
    contract.filters.NameRegistered(), fromBlock, toBlock
  ) as ghost.EventLog[];

  for (const ev of registered) {
    const { node, label, owner, expiry } = ev.args as unknown as {
      node: string; label: string; owner: string; expiry: bigint;
    };
    log.info({ node, label, owner, block: ev.blockNumber }, 'NameRegistered');
    await upsertName({ node, label, owner, expiry, txHash: ev.transactionHash, blockNum: ev.blockNumber });
    await notifyDnsSync(node);
  }

  // NameRenewed
  const renewed = await contract.queryFilter(
    contract.filters.NameRenewed(), fromBlock, toBlock
  ) as ghost.EventLog[];

  for (const ev of renewed) {
    const { node, newExpiry } = ev.args as unknown as { node: string; newExpiry: bigint };
    log.info({ node, block: ev.blockNumber }, 'NameRenewed');
    await upsertName({ node, expiry: newExpiry, txHash: ev.transactionHash, blockNum: ev.blockNumber });
  }

  // ResolverSet
  const resolverSet = await contract.queryFilter(
    contract.filters.ResolverSet(), fromBlock, toBlock
  ) as ghost.EventLog[];

  for (const ev of resolverSet) {
    const { node, resolver } = ev.args as unknown as { node: string; resolver: string };
    log.info({ node, resolver, block: ev.blockNumber }, 'ResolverSet');
    await upsertName({ node, resolver, txHash: ev.transactionHash, blockNum: ev.blockNumber });
    await notifyDnsSync(node);
  }

  // OwnershipTransferred
  const transferred = await contract.queryFilter(
    contract.filters.OwnershipTransferred(), fromBlock, toBlock
  ) as ghost.EventLog[];

  for (const ev of transferred) {
    const { node, newOwner } = ev.args as unknown as { node: string; newOwner: string };
    log.info({ node, newOwner, block: ev.blockNumber }, 'OwnershipTransferred');
    await upsertName({ node, owner: newOwner, txHash: ev.transactionHash, blockNum: ev.blockNumber });
  }

  // NameLocked
  const locked = await contract.queryFilter(
    contract.filters.NameLocked(), fromBlock, toBlock
  ) as ghost.EventLog[];

  for (const ev of locked) {
    const { node } = ev.args as unknown as { node: string };
    log.info({ node, block: ev.blockNumber }, 'NameLocked');
    await upsertName({ node, locked: true, txHash: ev.transactionHash, blockNum: ev.blockNumber });
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────
async function poll(contract: ghost.Contract, provider: ghost.JsonRpcProvider): Promise<void> {
  state.syncRuns += 1;
  try {
    const tip      = await provider.getBlockNumber();
    const safeHead = tip - CONFIRM_BLOCKS;
    const fromBlock = state.lastBlock + 1;

    if (fromBlock > safeHead) return; // nothing new

    const toBlock = Math.min(safeHead, fromBlock + 1_000); // max 1 000-block range
    log.debug({ fromBlock, toBlock }, 'scanning blocks');

    await processLogs(contract, fromBlock, toBlock);
    await saveIndexerState(toBlock);
    state.lastBlock  = toBlock;
    state.lastSyncAt = new Date().toISOString();
  } catch (err) {
    state.syncErrors += 1;
    log.error({ err }, 'poll error');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log.info({ l1: L1_RPC_URL, registry: GNS_REGISTRY_ADDR || '(not configured)' }, 'gns-indexer starting');

  // DB connection check
  if (DATABASE_URL) {
    try {
      await getDb().query('SELECT 1');
      log.info('PostgreSQL connected');
      state.connected = true;
    } catch (err) {
      log.error({ err }, 'PostgreSQL connection failed — running in degraded mode');
    }
  } else {
    log.warn('DATABASE_URL not set — running without persistence');
  }

  // Load last indexed block
  if (state.connected) {
    state.lastBlock = await loadIndexerState();
    log.info({ lastBlock: state.lastBlock }, 'resuming from saved block');
  }

  // Set up ghost client
  let contract: ghost.Contract | null = null;
  let provider: ghost.JsonRpcProvider | null = null;

  if (GNS_REGISTRY_ADDR && L1_RPC_URL) {
    provider = new ghost.JsonRpcProvider(L1_RPC_URL);
    contract = new ghost.Contract(GNS_REGISTRY_ADDR, GNS_REGISTRY_ABI, provider);

    // Start poll loop
    const tick = () => {
      if (provider && contract) {
        poll(contract, provider).finally(() => {
          setTimeout(tick, POLL_INTERVAL_MS);
        });
      }
    };
    setTimeout(tick, 2_000); // initial delay
    log.info({ interval: POLL_INTERVAL_MS }, 'poller started');
  } else {
    log.warn('GNS_REGISTRY_ADDRESS or L1_RPC_URL not set — event indexing disabled');
  }

  // ── HTTP server ──────────────────────────────────────────────────────────
  const app = express();
  app.use(pinoHttp({ logger: log }) as express.RequestHandler);
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      ok:         true,
      service:    'gns-indexer',
      lastBlock:  state.lastBlock,
      lastSyncAt: state.lastSyncAt,
      syncRuns:   state.syncRuns,
      syncErrors: state.syncErrors,
      connected:  state.connected,
    });
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    res.type('text/plain').send([
      `# HELP gns_indexer_last_block Last L1 block indexed`,
      `# TYPE gns_indexer_last_block gauge`,
      `gns_indexer_last_block ${state.lastBlock}`,
      `# HELP gns_indexer_sync_runs_total Total poll runs`,
      `# TYPE gns_indexer_sync_runs_total counter`,
      `gns_indexer_sync_runs_total ${state.syncRuns}`,
      `# HELP gns_indexer_sync_errors_total Total poll errors`,
      `# TYPE gns_indexer_sync_errors_total counter`,
      `gns_indexer_sync_errors_total ${state.syncErrors}`,
    ].join('\n'));
  });

  // Lookup a name node
  app.get('/names/:node', async (req: Request, res: Response) => {
    try {
      if (!state.connected) return void res.status(503).json({ error: 'db_not_ready' });
      const result = await getDb().query(
        'SELECT * FROM gns_names WHERE node = $1', [req.params.node]
      );
      if (result.rows.length === 0) return void res.status(404).json({ error: 'not_found' });
      res.json(result.rows[0]);
    } catch (err) {
      log.error({ err }, 'names lookup error');
      res.status(500).json({ error: 'internal' });
    }
  });

  // Search names by owner
  app.get('/owner/:address', async (req: Request, res: Response) => {
    try {
      if (!state.connected) return void res.status(503).json({ error: 'db_not_ready' });
      const result = await getDb().query(
        'SELECT * FROM gns_names WHERE owner = $1 ORDER BY updated_at DESC LIMIT 50',
        [req.params.address.toLowerCase()]
      );
      res.json({ names: result.rows });
    } catch (err) {
      log.error({ err }, 'owner lookup error');
      res.status(500).json({ error: 'internal' });
    }
  });

  app.listen(PORT, () => log.info({ port: PORT }, 'gns-indexer listening'));
}

main().catch((err) => {
  log.fatal({ err }, 'fatal startup error');
  process.exit(1);
});

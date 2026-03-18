/**
 * GhostScan — GhostChain Block Explorer & Indexer
 *
 * Indexes all three GhostChain layers (L1/L2/L3) and exposes a REST API
 * plus WebSocket stream for real-time block events.
 *
 * Endpoints:
 *   GET  /ghost/block/:height?layer=l1|l2|l3
 *   GET  /ghost/block/latest?layer=l1|l2|l3
 *   GET  /ghost/tx/:hash?layer=l1|l2|l3
 *   GET  /ghost/address/:addr?layer=l1|l2|l3
 *   GET  /ghost/contracts?layer=l1|l2|l3&page=1&limit=50
 *   GET  /ghost/stats?layer=l1|l2|l3
 *   WS   /ghost/stream?layer=l1|l2|l3   (real-time blocks)
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import Database from 'better-sqlite3';
import { GhostRPC } from './rpc.js';
import { Indexer } from './indexer.js';

// ─── Chain Configuration ──────────────────────────────────────────────────────

export const GHOST_LAYERS = {
  l1: { chainId: 14000101, rpc: process.env.GHOST_L1_RPC ?? 'http://localhost:18545', name: 'GhostChain L1' },
  l2: { chainId: 901,      rpc: process.env.GHOST_L2_RPC ?? 'http://localhost:29547', name: 'GhostL2'      },
  l3: { chainId: 903,      rpc: process.env.GHOST_L3_RPC ?? 'http://localhost:39545', name: 'GhostL3'      },
} as const;

export type GhostLayer = keyof typeof GHOST_LAYERS;

// ─── Database ─────────────────────────────────────────────────────────────────

function openDB(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      layer        TEXT NOT NULL,
      height       INTEGER NOT NULL,
      hash         TEXT NOT NULL,
      parent_hash  TEXT NOT NULL,
      proposer     TEXT NOT NULL,
      gas_used     INTEGER NOT NULL DEFAULT 0,
      gas_limit    INTEGER NOT NULL DEFAULT 30000000,
      tx_count     INTEGER NOT NULL DEFAULT 0,
      timestamp    INTEGER NOT NULL,
      PRIMARY KEY (layer, height)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_hash   ON blocks(hash);
    CREATE INDEX IF NOT EXISTS idx_blocks_ts     ON blocks(timestamp);

    CREATE TABLE IF NOT EXISTS transactions (
      layer     TEXT    NOT NULL,
      hash      TEXT    NOT NULL,
      height    INTEGER NOT NULL,
      from_addr TEXT    NOT NULL,
      to_addr   TEXT,
      value     TEXT    NOT NULL DEFAULT '0',
      gas       INTEGER NOT NULL DEFAULT 0,
      gas_price TEXT    NOT NULL DEFAULT '0',
      nonce     INTEGER NOT NULL DEFAULT 0,
      input     TEXT    NOT NULL DEFAULT '0x',
      status    INTEGER NOT NULL DEFAULT 1,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (layer, hash)
    );
    CREATE INDEX IF NOT EXISTS idx_txs_from  ON transactions(from_addr);
    CREATE INDEX IF NOT EXISTS idx_txs_to    ON transactions(to_addr);
    CREATE INDEX IF NOT EXISTS idx_txs_block ON transactions(layer, height);

    CREATE TABLE IF NOT EXISTS contracts (
      layer     TEXT NOT NULL,
      address   TEXT NOT NULL,
      creator   TEXT NOT NULL,
      height    INTEGER NOT NULL,
      bytecode  TEXT NOT NULL DEFAULT '0x',
      verified  INTEGER NOT NULL DEFAULT 0,
      name      TEXT,
      abi       TEXT,
      PRIMARY KEY (layer, address)
    );
  `);
  return db;
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

function layerParam(req: express.Request): GhostLayer {
  const l = (req.query.layer as string) ?? 'l1';
  if (l !== 'l1' && l !== 'l2' && l !== 'l3') {
    throw new Error(`Invalid layer: ${l}`);
  }
  return l;
}

function makeRouter(db: Database.Database, _rpc: GhostRPC): express.Router {
  const r = express.Router();

  // GET /ghost/block/latest
  r.get('/block/latest', (req, res) => {
    try {
      const layer = layerParam(req);
      const row = db.prepare(
        'SELECT * FROM blocks WHERE layer=? ORDER BY height DESC LIMIT 1'
      ).get(layer);
      if (!row) return void res.status(404).json({ error: 'No blocks indexed yet' });
      res.json(row);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /ghost/block/:height
  r.get('/block/:height', (req, res) => {
    try {
      const layer = layerParam(req);
      const height = parseInt(req.params.height, 10);
      const block = db.prepare(
        'SELECT * FROM blocks WHERE layer=? AND height=?'
      ).get(layer, height);
      if (!block) return void res.status(404).json({ error: 'Block not found' });
      const txs = db.prepare(
        'SELECT hash, from_addr, to_addr, value, status FROM transactions WHERE layer=? AND height=?'
      ).all(layer, height);
      res.json({ ...block as object, transactions: txs });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /ghost/tx/:hash
  r.get('/tx/:hash', (req, res) => {
    try {
      const layer = layerParam(req);
      const tx = db.prepare(
        'SELECT * FROM transactions WHERE layer=? AND hash=?'
      ).get(layer, req.params.hash.toLowerCase());
      if (!tx) return void res.status(404).json({ error: 'Transaction not found' });
      res.json(tx);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /ghost/address/:addr
  r.get('/address/:addr', (req, res) => {
    try {
      const layer = layerParam(req);
      const addr = req.params.addr.toLowerCase();
      const sent = db.prepare(
        'SELECT COUNT(*) as count, SUM(CAST(value as REAL)) as total_sent FROM transactions WHERE layer=? AND from_addr=?'
      ).get(layer, addr);
      const received = db.prepare(
        'SELECT COUNT(*) as count, SUM(CAST(value as REAL)) as total_received FROM transactions WHERE layer=? AND to_addr=?'
      ).get(layer, addr);
      const recentTxs = db.prepare(
        'SELECT hash, from_addr, to_addr, value, height, timestamp FROM transactions WHERE layer=? AND (from_addr=? OR to_addr=?) ORDER BY timestamp DESC LIMIT 25'
      ).all(layer, addr, addr);
      const contract = db.prepare(
        'SELECT address, creator, height, verified, name FROM contracts WHERE layer=? AND address=?'
      ).get(layer, addr);
      res.json({ address: addr, layer, sent, received, recentTxs, contract: contract ?? null });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /ghost/contracts
  r.get('/contracts', (req, res) => {
    try {
      const layer = layerParam(req);
      const page  = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
      const offset = (page - 1) * limit;
      const rows = db.prepare(
        'SELECT address, creator, height, verified, name FROM contracts WHERE layer=? ORDER BY height DESC LIMIT ? OFFSET ?'
      ).all(layer, limit, offset);
      const { total } = db.prepare('SELECT COUNT(*) as total FROM contracts WHERE layer=?').get(layer) as { total: number };
      res.json({ contracts: rows, total, page, limit });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /ghost/stats
  r.get('/stats', (req, res) => {
    try {
      const layer = layerParam(req);
      const { height } = db.prepare('SELECT MAX(height) as height FROM blocks WHERE layer=?').get(layer) as { height: number | null };
      const { txCount } = db.prepare('SELECT COUNT(*) as txCount FROM transactions WHERE layer=?').get(layer) as { txCount: number };
      const { contractCount } = db.prepare('SELECT COUNT(*) as contractCount FROM contracts WHERE layer=?').get(layer) as { contractCount: number };
      const chainInfo = GHOST_LAYERS[layer];
      res.json({
        layer,
        chainId: chainInfo.chainId,
        chainName: chainInfo.name,
        latestBlock: height ?? 0,
        totalTransactions: txCount,
        totalContracts: contractCount,
        nativeToken: 'GST',
        explorer: 'GhostScan',
      });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  return r;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function startGhostScan(options?: {
  port?: number;
  dbPath?: string;
  corsOrigin?: string;
}): Promise<void> {
  const port      = options?.port      ?? parseInt(process.env.GHOSTSCAN_PORT ?? '7700', 10);
  const dbPath    = options?.dbPath    ?? process.env.GHOSTSCAN_DB ?? './ghostscan.db';
  const corsOrigin = options?.corsOrigin ?? process.env.GHOSTSCAN_CORS_ORIGIN ?? '*';

  const db  = openDB(dbPath);
  const rpc = new GhostRPC(GHOST_LAYERS);
  const app = express();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'GhostScan' }));

  // Mount ghost routes
  app.use('/ghost', makeRouter(db, rpc));

  const server = createServer(app);

  // WebSocket — real-time block stream
  const wss = new WebSocketServer({ server, path: '/ghost/stream' });
  wss.on('connection', (ws, req) => {
    const url    = new URL(req.url!, `http://localhost`);
    const layer  = (url.searchParams.get('layer') ?? 'l1') as GhostLayer;
    const layers = GHOST_LAYERS[layer] ? [layer] : (['l1', 'l2', 'l3'] as GhostLayer[]);

    ws.send(JSON.stringify({ type: 'connected', layers, service: 'GhostScan', nativeToken: 'GST' }));

    // The indexer will call rpc.subscribeNewBlocks and emit events here
    const cleanup = rpc.onBlock(layers, (event) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'block', ...event }));
      }
    });

    ws.on('close', cleanup);
  });

  // Start indexers for all three layers
  const indexer = new Indexer(db, rpc);
  for (const layer of ['l1', 'l2', 'l3'] as GhostLayer[]) {
    indexer.start(layer);
  }

  server.listen(port, () => {
    console.log(`GhostScan running on port ${port}`);
    console.log(`  Explorer: GhostScan | Token: GST | Layers: L1/L2/L3`);
  });
}

// Run if invoked directly
startGhostScan();

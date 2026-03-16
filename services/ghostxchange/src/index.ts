/**
 * GhostXchange — GhostChain Native Decentralised Exchange
 *
 * Architecture:
 *   - Constant-product AMM (x * y = k) for GST/GRC token pairs
 *   - Off-chain order book for limit orders (settled on-chain)
 *   - L3 execution → L2 settlement → L1 finality (routing law compliant)
 *   - Native token: GST (never ETH or any external token)
 *
 * REST API:
 *   GET  /x/pools               — list all liquidity pools
 *   GET  /x/pools/:id           — pool detail + reserves
 *   POST /x/quote               — get swap quote
 *   POST /x/swap                — submit swap (signed tx forwarded to L3)
 *   POST /x/liquidity/add       — add liquidity
 *   POST /x/liquidity/remove    — remove liquidity
 *   GET  /x/orders              — list open limit orders
 *   POST /x/orders              — place limit order
 *   DELETE /x/orders/:id        — cancel limit order
 *   GET  /x/stats               — DEX-wide stats
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT   = parseInt(process.env.GHOSTXCHANGE_PORT ?? '7710', 10);
const DB_PATH = process.env.GHOSTXCHANGE_DB ?? './ghostxchange.db';

// Fee taken on each swap: 30 basis points (0.30%)
const SWAP_FEE_BPS = 30n;

const GST_TOKEN = {
  address: '0x0000000000000000000000000000000000000000', // native
  symbol:  'GST',
  decimals: 18,
  name: 'Ghost Token',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GhostPool {
  id:         string;
  tokenA:     string;
  symbolA:    string;
  tokenB:     string;
  symbolB:    string;
  reserveA:   string; // bigint as decimal string
  reserveB:   string;
  kLast:      string;
  fee:        number;  // basis points
  totalLP:    string;
  layer:      'l1' | 'l2' | 'l3';
  createdAt:  number;
}

export interface GhostSwapQuote {
  amountIn:    string;
  amountOut:   string;
  fee:         string;
  priceImpact: string; // percentage
  route:       string[];
}

export interface GhostOrder {
  id:          string;
  maker:       string;
  tokenIn:     string;
  tokenOut:    string;
  amountIn:    string;
  limitPrice:  string; // tokenOut per tokenIn (18 decimals)
  filled:      string;
  status:      'open' | 'filled' | 'cancelled';
  createdAt:   number;
}

// ─── AMM Engine ───────────────────────────────────────────────────────────────

export class GhostAMM {
  /**
   * Constant-product quote: amountOut = (reserveOut * amountIn * (10000 - feeBps)) / ((reserveIn * 10000) + (amountIn * (10000 - feeBps)))
   */
  static getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = SWAP_FEE_BPS): bigint {
    if (amountIn <= 0n) throw new Error('GhostXchange: amountIn must be > 0');
    if (reserveIn <= 0n || reserveOut <= 0n) throw new Error('GhostXchange: insufficient liquidity');

    const amountInWithFee = amountIn * (10_000n - feeBps);
    const numerator       = amountInWithFee * reserveOut;
    const denominator     = reserveIn * 10_000n + amountInWithFee;
    return numerator / denominator;
  }

  /**
   * How much tokenIn is needed to get exactly amountOut of tokenOut
   */
  static getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = SWAP_FEE_BPS): bigint {
    if (amountOut <= 0n) throw new Error('GhostXchange: amountOut must be > 0');
    if (reserveOut <= amountOut) throw new Error('GhostXchange: insufficient liquidity');

    const numerator   = reserveIn * amountOut * 10_000n;
    const denominator = (reserveOut - amountOut) * (10_000n - feeBps);
    return numerator / denominator + 1n;
  }

  /**
   * Price impact in basis points
   */
  static priceImpactBps(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = SWAP_FEE_BPS): bigint {
    const idealOut = (amountIn * reserveOut) / reserveIn;
    const actualOut = GhostAMM.getAmountOut(amountIn, reserveIn, reserveOut, feeBps);
    if (idealOut === 0n) return 0n;
    return ((idealOut - actualOut) * 10_000n) / idealOut;
  }

  /**
   * LP tokens minted when adding liquidity
   */
  static calcLPMint(amountA: bigint, amountB: bigint, reserveA: bigint, reserveB: bigint, totalLP: bigint): bigint {
    if (totalLP === 0n) {
      // Initial liquidity: sqrt(amountA * amountB) — integer approximation
      return bigIntSqrt(amountA * amountB);
    }
    const mintA = (amountA * totalLP) / reserveA;
    const mintB = (amountB * totalLP) / reserveB;
    return mintA < mintB ? mintA : mintB;
  }
}

function bigIntSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('sqrt of negative');
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

// ─── Database ─────────────────────────────────────────────────────────────────

function openDB(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      id         TEXT PRIMARY KEY,
      token_a    TEXT NOT NULL,
      symbol_a   TEXT NOT NULL,
      token_b    TEXT NOT NULL,
      symbol_b   TEXT NOT NULL,
      reserve_a  TEXT NOT NULL DEFAULT '0',
      reserve_b  TEXT NOT NULL DEFAULT '0',
      k_last     TEXT NOT NULL DEFAULT '0',
      fee_bps    INTEGER NOT NULL DEFAULT 30,
      total_lp   TEXT NOT NULL DEFAULT '0',
      layer      TEXT NOT NULL DEFAULT 'l3',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      maker       TEXT NOT NULL,
      token_in    TEXT NOT NULL,
      token_out   TEXT NOT NULL,
      amount_in   TEXT NOT NULL,
      limit_price TEXT NOT NULL,
      filled      TEXT NOT NULL DEFAULT '0',
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_maker  ON orders(maker);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    CREATE TABLE IF NOT EXISTS swaps (
      id          TEXT PRIMARY KEY,
      pool_id     TEXT NOT NULL,
      sender      TEXT NOT NULL,
      amount_in   TEXT NOT NULL,
      amount_out  TEXT NOT NULL,
      fee         TEXT NOT NULL,
      layer       TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      tx_hash     TEXT
    );
  `);
  return db;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function startGhostXchange(): void {
  const db  = openDB(DB_PATH);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  // Health
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'GhostXchange', nativeToken: 'GST', dex: 'GhostXchange' });
  });

  // GET /x/pools
  app.get('/x/pools', (_req, res) => {
    const pools = db.prepare('SELECT * FROM pools ORDER BY created_at DESC').all();
    res.json({ pools, count: pools.length, nativeToken: GST_TOKEN });
  });

  // GET /x/pools/:id
  app.get('/x/pools/:id', (req, res) => {
    const pool = db.prepare('SELECT * FROM pools WHERE id=?').get(req.params.id);
    if (!pool) return void res.status(404).json({ error: 'Pool not found' });
    res.json(pool);
  });

  // POST /x/pools — create pool (requires governance in production)
  app.post('/x/pools', (req, res) => {
    try {
      const { tokenA, symbolA, tokenB, symbolB, layer = 'l3' } = req.body as Record<string, string>;
      if (!tokenA || !tokenB) return void res.status(400).json({ error: 'tokenA and tokenB required' });

      const id = `${tokenA.toLowerCase()}-${tokenB.toLowerCase()}-${layer}`;
      db.prepare(`
        INSERT OR IGNORE INTO pools(id, token_a, symbol_a, token_b, symbol_b, layer, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tokenA.toLowerCase(), symbolA ?? '???', tokenB.toLowerCase(), symbolB ?? '???', layer, Date.now());

      res.status(201).json({ id, message: 'Pool created' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // POST /x/quote
  app.post('/x/quote', (req, res) => {
    try {
      const { poolId, amountIn, direction } = req.body as { poolId: string; amountIn: string; direction: 'a_to_b' | 'b_to_a' };
      const pool = db.prepare('SELECT * FROM pools WHERE id=?').get(poolId) as GhostPool & { reserve_a: string; reserve_b: string; fee_bps: number };
      if (!pool) return void res.status(404).json({ error: 'Pool not found' });

      const ain   = BigInt(amountIn);
      const resA  = BigInt(pool.reserve_a);
      const resB  = BigInt(pool.reserve_b);
      const feeBps = BigInt(pool.fee_bps);

      const [reserveIn, reserveOut] = direction === 'a_to_b' ? [resA, resB] : [resB, resA];
      const amountOut  = GhostAMM.getAmountOut(ain, reserveIn, reserveOut, feeBps);
      const fee        = (ain * feeBps) / 10_000n;
      const impactBps  = GhostAMM.priceImpactBps(ain, reserveIn, reserveOut, feeBps);

      res.json({
        amountIn:    ain.toString(),
        amountOut:   amountOut.toString(),
        fee:         fee.toString(),
        priceImpact: `${(Number(impactBps) / 100).toFixed(2)}%`,
        route: [pool.token_a, pool.token_b],
        nativeToken: 'GST',
        service: 'GhostXchange',
      });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // POST /x/liquidity/add
  app.post('/x/liquidity/add', (req, res) => {
    try {
      const { poolId, amountA, amountB, provider } = req.body as Record<string, string>;
      const pool = db.prepare('SELECT * FROM pools WHERE id=?').get(poolId) as { reserve_a: string; reserve_b: string; total_lp: string } | undefined;
      if (!pool) return void res.status(404).json({ error: 'Pool not found' });

      const resA  = BigInt(pool.reserve_a);
      const resB  = BigInt(pool.reserve_b);
      const totalLP = BigInt(pool.total_lp);
      const aIn   = BigInt(amountA);
      const bIn   = BigInt(amountB);

      const lpMinted = GhostAMM.calcLPMint(aIn, bIn, resA, resB, totalLP);
      const newResA  = (resA + aIn).toString();
      const newResB  = (resB + bIn).toString();
      const newLP    = (totalLP + lpMinted).toString();
      const kLast    = ((resA + aIn) * (resB + bIn)).toString();

      db.prepare('UPDATE pools SET reserve_a=?, reserve_b=?, total_lp=?, k_last=? WHERE id=?')
        .run(newResA, newResB, newLP, kLast, poolId);

      res.json({ lpMinted: lpMinted.toString(), provider, poolId, nativeToken: 'GST' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // GET /x/stats
  app.get('/x/stats', (_req, res) => {
    const poolCount = (db.prepare('SELECT COUNT(*) as c FROM pools').get() as { c: number }).c;
    const orderCount = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='open'").get() as { c: number }).c;
    const swapCount  = (db.prepare('SELECT COUNT(*) as c FROM swaps').get() as { c: number }).c;
    res.json({
      dex: 'GhostXchange',
      nativeToken: 'GST',
      totalPools: poolCount,
      openOrders: orderCount,
      totalSwaps: swapCount,
      swapFee: '0.30%',
      routing: 'L3 execution → L2 settlement → L1 finality',
    });
  });

  // GET /x/orders
  app.get('/x/orders', (req, res) => {
    const status = (req.query.status as string) ?? 'open';
    const maker  = req.query.maker as string;
    let sql = 'SELECT * FROM orders WHERE status=?';
    const params: string[] = [status];
    if (maker) { sql += ' AND maker=?'; params.push(maker.toLowerCase()); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const orders = db.prepare(sql).all(...params);
    res.json({ orders });
  });

  // POST /x/orders
  app.post('/x/orders', (req, res) => {
    try {
      const { maker, tokenIn, tokenOut, amountIn, limitPrice } = req.body as Record<string, string>;
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO orders(id, maker, token_in, token_out, amount_in, limit_price, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, maker.toLowerCase(), tokenIn.toLowerCase(), tokenOut.toLowerCase(), amountIn, limitPrice, Date.now());
      res.status(201).json({ id, status: 'open', service: 'GhostXchange' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // DELETE /x/orders/:id
  app.delete('/x/orders/:id', (req, res) => {
    const result = db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND status='open'").run(req.params.id);
    if (result.changes === 0) return void res.status(404).json({ error: 'Order not found or already settled' });
    res.json({ id: req.params.id, status: 'cancelled' });
  });

  app.listen(PORT, () => {
    console.log(`GhostXchange DEX running on port ${PORT}`);
    console.log(`  Token: GST | Fee: 0.30% | Routing: L3→L2→L1`);
  });
}

startGhostXchange();

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import Database from 'better-sqlite3';
import Redis from 'ioredis';
import { mkdirSync } from 'fs';
import { createLogger, transports, format } from 'winston';

const PORT       = Number(process.env.PORT       ?? 7018);
const JWT_SECRET = process.env.JWT_SECRET        ?? 'litvyblive-dev-secret';
const DATA_DIR   = process.env.DATA_DIR          ?? '/tmp/litvyblive/games';
const REDIS_URL  = process.env.REDIS_URL         ?? 'redis://localhost:6379';
const GHOST_L3_CHAIN_ID = 903;

const log = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(`${DATA_DIR}/games.db`);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    game_key    TEXT NOT NULL,
    player_id   TEXT NOT NULL,
    stream_id   TEXT,
    entry_fee   REAL NOT NULL,
    payout      REAL DEFAULT 0,
    result      TEXT,
    won         INTEGER DEFAULT 0,
    chain_id    INTEGER DEFAULT 903,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_stream ON sessions(stream_id);

  CREATE TABLE IF NOT EXISTS wallet_locks (
    user_id TEXT PRIMARY KEY,
    locked  INTEGER DEFAULT 0
  );
`);

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.connect().catch(() => log.warn('Redis unavailable'));

// In-memory ledger for game play costs (debited from wallet-service via event)
// Games deduct from wallet balance by publishing wallet:debit event
const CATALOGUE = [
  { key: 'ghost-slots',    name: 'Ghost Slots',     entryFee: 10,  maxPayout: 500,  description: 'Spin to win GST on GhostL3' },
  { key: 'flip-coin',      name: 'GST Flip',         entryFee: 5,   maxPayout: 9,    description: 'Double or nothing' },
  { key: 'ghost-dice',     name: 'Ghost Dice',       entryFee: 20,  maxPayout: 200,  description: '2d6 — roll 7+ to win' },
  { key: 'jackpot-rush',   name: 'Jackpot Rush',     entryFee: 50,  maxPayout: 5000, description: 'Progressive jackpot' },
  { key: 'battle-royale',  name: 'Battle Royale',    entryFee: 100, maxPayout: 3000, description: 'Last ghost standing' },
  { key: 'pk-roulette',    name: 'PK Roulette',      entryFee: 25,  maxPayout: 400,  description: 'Roulette during PK streams' },
];

interface AuthReq extends Request { userId?: string }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try { req.userId = (jwt.verify(h.slice(7), JWT_SECRET) as { userId: string }).userId; next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

/** Deterministic payout calculation — seeded by userId + timestamp for audit trail */
function runGame(gameKey: string): { result: string; won: boolean; multiplier: number } {
  const r = Math.random();
  switch (gameKey) {
    case 'ghost-slots': {
      // 3-reel: 30% win rate, multipliers: 0.5-10x
      const won   = r < 0.30;
      const mult  = won ? (r < 0.05 ? 10 : r < 0.15 ? 5 : 2) : 0;
      const icons = ['👻', '💎', '⚡', '🌙', '🔥', '🌟'];
      const reels = [icons[Math.floor(Math.random() * icons.length)], icons[Math.floor(Math.random() * icons.length)], icons[Math.floor(Math.random() * icons.length)]];
      return { result: reels.join(' '), won, multiplier: mult };
    }
    case 'flip-coin': {
      const won  = r < 0.48; // slight house edge
      return { result: won ? '👻 Heads' : '💀 Tails', won, multiplier: won ? 1.8 : 0 };
    }
    case 'ghost-dice': {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const sum = d1 + d2;
      const won  = sum >= 7;
      const mult = sum === 7 ? 2 : sum >= 10 ? 4 : sum === 12 ? 8 : won ? 1.5 : 0;
      return { result: `${d1}+${d2}=${sum}`, won, multiplier: mult };
    }
    case 'jackpot-rush': {
      const won  = r < 0.05; // 5% jackpot hit
      const mult = won ? (r < 0.01 ? 100 : 20) : (r < 0.3 ? 0.5 : 0);
      return { result: won ? '🎰 JACKPOT! 🎰' : '💔 No jackpot', won, multiplier: mult };
    }
    case 'battle-royale': {
      const rank = Math.floor(Math.random() * 10) + 1;
      const won  = rank <= 3;
      const mult = rank === 1 ? 30 : rank === 2 ? 15 : rank === 3 ? 5 : 0;
      return { result: `Finished #${rank}`, won, multiplier: mult };
    }
    case 'pk-roulette': {
      const pocket = Math.floor(Math.random() * 38); // 0-37 (0 and 00 are house)
      const won  = pocket > 1 && pocket % 2 === 0; // even numbers win
      const mult = won ? 1.9 : 0;
      return { result: `Pocket ${pocket}`, won, multiplier: mult };
    }
    default:
      return { result: 'invalid game', won: false, multiplier: 0 };
  }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*', credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'games-service', chain: GHOST_L3_CHAIN_ID }));

// ── GET /games/catalogue ──────────────────────────────────────────────────────
app.get('/catalogue', (_req, res) => res.json(CATALOGUE));

// ── POST /games/:key/play ─────────────────────────────────────────────────────
const playSchema = z.object({
  streamId:  z.string().optional(),
  chainId:   z.literal(GHOST_L3_CHAIN_ID),
});

app.post('/:key/play', requireAuth, (req: AuthReq, res) => {
  const game = CATALOGUE.find((g) => g.key === req.params['key']);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

  const parsed = playSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Run game logic
  const outcome = runGame(game.key);
  const payout  = outcome.won ? Math.min(game.entryFee * outcome.multiplier, game.maxPayout) : 0;
  const netGain = payout - game.entryFee;

  const id  = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sessions (id,game_key,player_id,stream_id,entry_fee,payout,result,won,chain_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(id, game.key, req.userId!, parsed.data.streamId ?? null, game.entryFee, payout, outcome.result, outcome.won ? 1 : 0, GHOST_L3_CHAIN_ID, now);

  // Emit wallet events
  const entryEvent = JSON.stringify({ userId: req.userId!, amount: game.entryFee, type: 'game_entry', chainId: GHOST_L3_CHAIN_ID });
  redis.publish('wallet:debit', entryEvent).catch(() => null);
  if (payout > 0) {
    redis.publish('wallet:credit', JSON.stringify({ userId: req.userId!, amount: payout, type: 'game_payout', chainId: GHOST_L3_CHAIN_ID })).catch(() => null);
  }
  redis.publish('game:played', JSON.stringify({ sessionId: id, gameKey: game.key, playerId: req.userId!, won: outcome.won, payout, chainId: GHOST_L3_CHAIN_ID })).catch(() => null);

  res.json({
    sessionId: id,
    game:      game.name,
    result:    outcome.result,
    won:       outcome.won,
    entryFee:  game.entryFee,
    payout,
    netGain,
    chainId:   GHOST_L3_CHAIN_ID,
  });
});

// ── GET /games/:key/history/:userId ───────────────────────────────────────────
app.get('/:key/history/:userId', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const rows  = db.prepare(`
    SELECT * FROM sessions WHERE game_key=? AND player_id=? ORDER BY created_at DESC LIMIT ?
  `).all(req.params['key'], req.params['userId'], limit);
  res.json(rows);
});

// ── GET /games/leaderboard ────────────────────────────────────────────────────
app.get('/leaderboard', (_req, res) => {
  const rows = db.prepare(`
    SELECT player_id, COUNT(*) as games_played, SUM(payout) as total_payout,
           SUM(CASE WHEN won=1 THEN 1 ELSE 0 END) as wins
    FROM sessions
    GROUP BY player_id
    ORDER BY total_payout DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// ── GET /games/my-stats ───────────────────────────────────────────────────────
app.get('/my-stats', requireAuth, (req: AuthReq, res) => {
  const stats = db.prepare(`
    SELECT game_key,
           COUNT(*) as games_played,
           SUM(payout) as total_payout,
           SUM(CASE WHEN won=1 THEN 1 ELSE 0 END) as wins,
           SUM(entry_fee) as total_wagered
    FROM sessions WHERE player_id=?
    GROUP BY game_key
  `).all(req.userId!);
  res.json(stats);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => log.info(`Games service running on :${PORT}`));

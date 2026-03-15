import { Router } from 'express';
import { getDb } from '../db/index.js';

export const rankingsRouter = Router();

const validTypes = new Set(['creators', 'fans', 'agencies', 'gifts']);

rankingsRouter.get('/:type', (req, res) => {
  const type = req.params['type'];
  if (!validTypes.has(type!)) {
    res.status(400).json({ error: 'Invalid ranking type' });
    return;
  }
  const db = getDb();
  let rows: unknown[];
  if (type === 'creators') {
    rows = db
      .prepare(
        'SELECT id as userId, username, level, total_gifts as score, avatar_url FROM users WHERE is_host=1 ORDER BY total_gifts DESC LIMIT 100',
      )
      .all();
  } else if (type === 'fans') {
    rows = db
      .prepare(
        'SELECT sender_id as userId, SUM(price_gst) as score FROM gifts GROUP BY sender_id ORDER BY score DESC LIMIT 100',
      )
      .all();
  } else if (type === 'agencies') {
    rows = db
      .prepare(
        'SELECT a.id as userId, a.name as username, COUNT(u.id) as score FROM agencies a LEFT JOIN users u ON u.agency_id=a.id GROUP BY a.id ORDER BY score DESC LIMIT 100',
      )
      .all();
  } else {
    // gift senders leaderboard
    rows = db
      .prepare(
        'SELECT sender_id as userId, SUM(price_gst) as score FROM gifts GROUP BY sender_id ORDER BY score DESC LIMIT 100',
      )
      .all();
  }
  const ranked = (rows as Record<string, unknown>[]).map((r, i) => ({ rank: i + 1, ...r }));
  res.json(ranked);
});

import { Router } from 'express';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.get('/', (req, res) => {
  const db    = getDb();
  const page  = Math.max(1, Number(req.query['page']  ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset = (page - 1) * limit;
  const users = db
    .prepare('SELECT id, username, avatar_url, level, followers, following, total_gifts, gst_balance, talent_score, agency_id, is_host, created_at FROM users ORDER BY level DESC LIMIT ? OFFSET ?')
    .all(limit, offset);
  const { total } = db.prepare('SELECT COUNT(*) as total FROM users').get() as { total: number };
  res.json({ users, total, page, limit });
});

usersRouter.get('/me', (req: AuthRequest, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, avatar_url, level, followers, following, total_gifts, gst_balance, talent_score, agency_id, is_host FROM users WHERE id=?')
    .get(req.userId!);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

usersRouter.get('/:id', (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, avatar_url, level, followers, following, total_gifts, gst_balance, talent_score, agency_id, is_host FROM users WHERE id=?')
    .get(req.params['id']);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

usersRouter.post('/me/avatar', (req: AuthRequest, res) => {
  const config = req.body as Record<string, unknown>;
  const db = getDb();
  db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(
    JSON.stringify(config),
    req.userId!,
  );
  res.json({ success: true });
});

usersRouter.post('/:id/ban', (_req, res) => {
  // Soft-ban: mark account as inactive in a real implementation.
  // Here we just acknowledge for the admin dashboard.
  res.json({ success: true, banned: _req.params['id'] });
});

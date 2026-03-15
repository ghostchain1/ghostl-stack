import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const socialRouter = Router();

socialRouter.get('/feed', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT p.*, u.username as author_name, u.avatar_url FROM social_posts p JOIN users u ON p.author_id=u.id ORDER BY p.created_at DESC LIMIT 50',
    )
    .all();
  res.json(rows);
});

socialRouter.post('/posts', (req: AuthRequest, res) => {
  const { content, mediaUrl } = req.body as { content: string; mediaUrl?: string };
  if (!content?.trim()) { res.status(400).json({ error: 'Content is required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare(
    'INSERT INTO social_posts (id, author_id, content, media_url, created_at) VALUES (?,?,?,?,?)',
  ).run(id, req.userId!, content.trim(), mediaUrl ?? null, new Date().toISOString());
  res.status(201).json({ id });
});

socialRouter.post('/posts/:id/like', (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare('UPDATE social_posts SET likes=likes+1 WHERE id=?').run(req.params['id']);
  res.json({ success: true });
});

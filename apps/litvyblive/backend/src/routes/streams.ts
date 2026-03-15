import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { io } from '../index.js';

export const streamsRouter = Router();

const startSchema = z.object({
  title: z.string().max(128).default(''),
  category: z.string().max(64).default('general'),
  isAvatarMode: z.boolean().default(false),
});

streamsRouter.get('/live', (req, res) => {
  const db = getDb();
  const category = typeof req.query['category'] === 'string' ? req.query['category'] : null;
  const rows = category
    ? db
        .prepare(
          'SELECT s.*, u.username as host_name FROM streams s JOIN users u ON s.host_id=u.id WHERE s.is_live=1 AND s.category=? ORDER BY s.viewer_count DESC LIMIT 50',
        )
        .all(category)
    : db
        .prepare(
          'SELECT s.*, u.username as host_name FROM streams s JOIN users u ON s.host_id=u.id WHERE s.is_live=1 ORDER BY s.viewer_count DESC LIMIT 50',
        )
        .all();
  res.json(rows);
});

streamsRouter.get('/recommended', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT s.*, u.username as host_name FROM streams s JOIN users u ON s.host_id=u.id WHERE s.is_live=1 ORDER BY s.viewer_count DESC LIMIT 20',
    )
    .all();
  res.json(rows);
});

streamsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT s.*, u.username as host_name FROM streams s JOIN users u ON s.host_id=u.id WHERE s.id=?')
    .get(req.params['id']);
  if (!row) { res.status(404).json({ error: 'Stream not found' }); return; }
  res.json(row);
});

streamsRouter.post('/start', (req: AuthRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { title, category, isAvatarMode } = parsed.data;
  const db = getDb();
  const id = uuid();
  db.prepare(
    'INSERT INTO streams (id, host_id, title, category, is_avatar_mode, started_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, req.userId!, title, category, isAvatarMode ? 1 : 0, new Date().toISOString());
  const stream = db.prepare('SELECT * FROM streams WHERE id=?').get(id);
  res.status(201).json(stream);
});

streamsRouter.post('/:id/end', (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare('UPDATE streams SET is_live=0, ended_at=? WHERE id=? AND host_id=?').run(
    new Date().toISOString(), req.params['id'], req.userId!,
  );
  io.to(req.params['id']!).emit('stream_ended', { streamId: req.params['id'] });
  res.json({ success: true });
});

streamsRouter.post('/:id/pk/start', (req: AuthRequest, res) => {
  const { opponentStreamId } = req.body as { opponentStreamId?: string };
  if (!opponentStreamId) { res.status(400).json({ error: 'opponentStreamId required' }); return; }
  const db = getDb();
  db.prepare('UPDATE streams SET is_pk_active=1, opponent_stream_id=? WHERE id=?').run(
    opponentStreamId, req.params['id'],
  );
  io.to(req.params['id']!).emit('pk_start', { streamId: req.params['id'], opponentStreamId });
  io.to(opponentStreamId).emit('pk_start', { streamId: opponentStreamId, opponentStreamId: req.params['id'] });
  res.json({ success: true });
});

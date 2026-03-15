import { Router } from 'express';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const eventsRouter = Router();

eventsRouter.get('/active', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM events WHERE is_active=1 AND ends_at > datetime('now') ORDER BY ends_at ASC")
    .all();
  res.json(rows);
});

eventsRouter.post('/:id/join', (req: AuthRequest, res) => {
  const db = getDb();
  const event = db.prepare('SELECT id FROM events WHERE id=? AND is_active=1').get(req.params['id']);
  if (!event) { res.status(404).json({ error: 'Event not found or inactive' }); return; }
  // Record participation — extended participation table TBD
  res.json({ success: true, message: 'Joined event on GhostL3' });
});

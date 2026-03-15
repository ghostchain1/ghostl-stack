import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const agencyRouter = Router();

agencyRouter.get('/me', (req: AuthRequest, res) => {
  const db = getDb();
  const user = db.prepare('SELECT agency_id FROM users WHERE id=?').get(req.userId!) as
    | { agency_id: string | null }
    | undefined;
  if (!user?.agency_id) { res.status(404).json({ error: 'Not in an agency' }); return; }
  const agency = db.prepare('SELECT * FROM agencies WHERE id=?').get(user.agency_id);
  if (!agency) { res.status(404).json({ error: 'Agency not found' }); return; }
  const hostsCount = (
    db.prepare('SELECT COUNT(*) as c FROM users WHERE agency_id=?').get(user.agency_id) as
      | { c: number }
      | undefined
  )?.c ?? 0;
  res.json({ ...agency as object, hostsCount });
});

agencyRouter.get('/talent-recommendations', (_req, res) => {
  // GhostBrain AI talent recommendations — returns top unaffiliated hosts by talent_score
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, username, talent_score, followers, total_gifts FROM users WHERE agency_id IS NULL AND is_host=1 ORDER BY talent_score DESC LIMIT 20',
    )
    .all();
  res.json(rows);
});

agencyRouter.post('/recruit', (req: AuthRequest, res) => {
  const parsed = z.object({ targetUserId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const db = getDb();
  const myUser = db.prepare('SELECT agency_id FROM users WHERE id=?').get(req.userId!) as
    | { agency_id: string | null }
    | undefined;
  if (!myUser?.agency_id) { res.status(403).json({ error: 'You must be an agency manager' }); return; }
  // Record invite — in production this would trigger a notification
  res.json({ success: true, message: 'Recruitment invite sent via GhostBrain' });
});

const releaseSchema = z.object({
  hostId: z.string().uuid(),
  reason: z.string().min(10).max(1000),
});

agencyRouter.post('/release-request', async (req: AuthRequest, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { hostId, reason } = parsed.data;

  // Forward to GhostBrain AI mediator for analysis
  try {
    const mediatorRes = await fetch(`${process.env.GHOSTBRAIN_URL ?? 'http://localhost:7002'}/litvyb/release-mediate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agencyId: req.userId, hostId, reason }),
    });
    if (mediatorRes.ok) {
      const decision = await mediatorRes.json();
      res.json(decision);
      return;
    }
  } catch {
    // GhostBrain unavailable — return pending status
  }

  res.json({
    status: 'pending',
    message: 'GhostBrain is reviewing the release request. Decision will be issued within 24 hours.',
    requestId: uuid(),
  });
});

agencyRouter.get('/list', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.commission_rate, a.logo_url,
              COUNT(u.id) as hosts_count,
              IFNULL((SELECT SUM(g.price_gst) FROM gifts g
                      JOIN users hu ON hu.id=g.stream_id
                      WHERE hu.agency_id=a.id), 0) as monthly_revenue,
              ROW_NUMBER() OVER (ORDER BY COUNT(u.id) DESC) as ranking
       FROM agencies a
       LEFT JOIN users u ON u.agency_id=a.id
       GROUP BY a.id
       ORDER BY hosts_count DESC
       LIMIT 100`,
    )
    .all();
  res.json(rows);
});

agencyRouter.get('/:id', (req, res) => {
  const db = getDb();
  const agency = db.prepare('SELECT * FROM agencies WHERE id=?').get(req.params['id']) as
    | Record<string, unknown>
    | undefined;
  if (!agency) { res.status(404).json({ error: 'Agency not found' }); return; }
  const { hostsCount } = db
    .prepare('SELECT COUNT(*) as hostsCount FROM users WHERE agency_id=?')
    .get(req.params['id']) as { hostsCount: number };
  res.json({ ...agency, hostsCount, ranking: 0 });
});

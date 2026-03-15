/**
 * Governor route — exposes GhostBrain state to the admin dashboard.
 *
 * GET  /governor/state     → full GovernorState snapshot
 * GET  /governor/decisions → last 100 decisions (latest-first)
 * POST /governor/enforce   → L3 chain-ID enforcement check
 */

import { Router } from 'express';
import { governor } from '../../../../ghostbrain/governor_core.js';

export const governorRouter = Router();

governorRouter.get('/state', (_req, res) => {
  res.json(governor.state);
});

governorRouter.get('/decisions', (_req, res) => {
  const { decisions } = governor.state;
  res.json([...decisions].reverse());   // newest first
});

governorRouter.post('/enforce', (req, res) => {
  const { chainId } = req.body as { chainId?: number };
  if (chainId === undefined) {
    res.status(400).json({ error: 'chainId required' });
    return;
  }
  try {
    governor.enforceL3(Number(chainId));
    res.json({ allowed: true, chainId });
  } catch (err) {
    res.status(403).json({ allowed: false, error: String(err) });
  }
});

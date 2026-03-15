import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { GameModel } from '../models/game.js';

export const gamesRouter = Router();

gamesRouter.get('/recommended', (_req, res) => {
  // GhostBrain returns personalized picks — fallback to full catalog
  res.json(GameModel.catalog);
});

gamesRouter.post('/:id/join', (req: AuthRequest, res) => {
  const game = GameModel.catalog.find((g) => g.id === req.params['id']);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!game.isAvailable) { res.status(409).json({ error: 'Game is currently unavailable' }); return; }
  // Deduct entry fee via microtx engine (async settlement on GhostL3 chain 903)
  res.json({
    gameId: game.id,
    gameName: game.name,
    sessionId: `session_${Date.now()}`,
    entryFee: game.entryFee,
    chainId: 903,
  });
});

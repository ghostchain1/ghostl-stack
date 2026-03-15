import { Router } from 'express';

/**
 * GhostBrain Game AI — dynamic game rotation, anti-cheat scoring,
 * and prize pool management recommendations.
 */
export const gameAiRouter = Router();

const GAME_CATALOG = [
  'lucky_spin', 'guess_number', 'dice', 'treasure_box', 'pk_battle', 'lucky_slots',
];

gameAiRouter.get('/rotation', (_req, res) => {
  // Shuffle catalog with AI-weighted ordering (simplified: random rotation)
  const rotated = [...GAME_CATALOG].sort(() => Math.random() - 0.5);
  res.json({
    rotation: rotated,
    nextRotationMs: 3_600_000, // 1 hour
    engine: 'GhostBrain Game AI v1',
  });
});

gameAiRouter.post('/score', (req, res) => {
  const { gameId, userId, result, duration } = req.body as {
    gameId: string;
    userId: string;
    result: 'win' | 'loss';
    duration: number;
  };
  if (!gameId || !userId) {
    res.status(400).json({ error: 'gameId and userId required' });
    return;
  }
  // Anti-cheat: flag suspiciously fast completions
  const suspicious = duration < 2000 && result === 'win';
  res.json({
    userId,
    gameId,
    result,
    suspicious,
    gstReward: result === 'win' && !suspicious ? 10 : 0,
    engine: 'GhostBrain Game AI v1',
    chainId: 903,
  });
});

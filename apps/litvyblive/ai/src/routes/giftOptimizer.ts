import { Router } from 'express';

/**
 * GhostBrain Gift Economy Optimizer — suggests optimal gift timing, amounts,
 * and types to maximize creator revenue on GhostL3 (chain 903).
 */
export const giftOptimizerRouter = Router();

interface GiftHistory {
  giftId: string;
  price: number;
  timestamp: number;
}

giftOptimizerRouter.post('/suggest', (req, res) => {
  const { userId, streamId, history } = req.body as {
    userId: string;
    streamId: string;
    history: GiftHistory[];
  };

  if (!userId || !streamId) {
    res.status(400).json({ error: 'userId and streamId required' });
    return;
  }

  // Analyze spend patterns and suggest next gift
  const avgSpend = history.length > 0
    ? history.reduce((s, g) => s + g.price, 0) / history.length
    : 10;

  const suggestions = [
    { giftId: 'rose', price: 1, reason: 'Show appreciation' },
    { giftId: 'crown', price: 50, reason: 'Trending this session' },
    { giftId: 'rocket', price: 100, reason: `Based on your avg spend of ${avgSpend.toFixed(0)} GST` },
  ].filter((s) => s.price <= avgSpend * 3); // Don't suggest > 3x average

  res.json({
    suggestions,
    avgSpend,
    engine: 'GhostBrain Gift Optimizer v1',
    chainId: 903,
  });
});

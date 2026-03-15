import { Router } from 'express';

/**
 * GhostBrain Talent Scout — scores unaffiliated hosts by engagement signals
 * and returns ranked recommendations for agencies.
 */
export const talentRouter = Router();

interface HostSignal {
  userId: string;
  username: string;
  followers: number;
  avgViewers: number;
  giftsLast30d: number;
  streamsLast30d: number;
}

function scoreTalent(signal: HostSignal): number {
  const engagementRate = signal.avgViewers / Math.max(signal.followers, 1);
  const giftVelocity = signal.giftsLast30d / Math.max(signal.streamsLast30d, 1);
  const followerWeight = Math.log10(Math.max(signal.followers, 10));
  return Math.round((engagementRate * 40 + giftVelocity * 40 + followerWeight * 20) * 100) / 100;
}

talentRouter.post('/score', (req, res) => {
  const signals = req.body as HostSignal[];
  if (!Array.isArray(signals)) {
    res.status(400).json({ error: 'Expected array of HostSignal' });
    return;
  }
  const scored = signals
    .map((s) => ({ ...s, talentScore: scoreTalent(s) }))
    .sort((a, b) => b.talentScore - a.talentScore);
  res.json({ recommendations: scored, engine: 'GhostBrain Talent Scout v1' });
});

talentRouter.get('/trending', (_req, res) => {
  // Placeholder — in production, queries GhostBrain oracle for real-time trending hosts
  res.json({ trending: [], engine: 'GhostBrain Talent Scout v1' });
});

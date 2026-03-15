import { Router } from 'express';

/**
 * GhostBrain Matchmaking Engine — pairs viewers with live rooms based on
 * interest vectors, activity history, and GST spend patterns.
 */
export const matchmakingRouter = Router();

interface ViewerProfile {
  userId: string;
  categories: string[];
  avgGstSpend: number;
  activeHours: number[];
}

interface StreamProfile {
  streamId: string;
  category: string;
  viewerCount: number;
  hostLevel: number;
}

function matchScore(viewer: ViewerProfile, stream: StreamProfile): number {
  const categoryMatch = viewer.categories.includes(stream.category) ? 50 : 0;
  const sizePreference = Math.min(stream.viewerCount / 100, 1) * 20;
  const levelBonus = Math.min(stream.hostLevel / 10, 1) * 30;
  return categoryMatch + sizePreference + levelBonus;
}

matchmakingRouter.post('/recommend', (req, res) => {
  const { viewer, streams } = req.body as {
    viewer: ViewerProfile;
    streams: StreamProfile[];
  };
  if (!viewer || !Array.isArray(streams)) {
    res.status(400).json({ error: 'viewer and streams[] required' });
    return;
  }
  const ranked = streams
    .map((s) => ({ ...s, score: matchScore(viewer, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json({ matches: ranked, engine: 'GhostBrain Matchmaking v1' });
});

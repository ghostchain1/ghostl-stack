import 'dotenv/config';
import express from 'express';
import { talentRouter } from './routes/talent.js';
import { matchmakingRouter } from './routes/matchmaking.js';
import { giftOptimizerRouter } from './routes/giftOptimizer.js';
import { gameAiRouter } from './routes/gameAi.js';
import { releaseRouter } from './routes/hostRelease.js';
import { governorRouter } from './routes/governor.js';
import { logger } from './utils/logger.js';
import { governor } from '../../../ghostbrain/governor_core.js';
import { EconomyAgent } from '../../../ghostbrain/agents/economy_agent.js';
import { SecurityAgent } from '../../../ghostbrain/agents/security_agent.js';
import { DiscoveryAgent } from '../../../ghostbrain/agents/discovery_agent.js';
import { EventAgent } from '../../../ghostbrain/agents/event_agent.js';
import { InfrastructureAgent } from '../../../ghostbrain/agents/infrastructure_agent.js';
import { TreasuryAgent } from '../../../ghostbrain/agents/treasury_agent.js';
import type { PlatformMetrics } from '../../../ghostbrain/governor_core.js';

const PORT        = Number(process.env.AI_PORT    ?? 7002);
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:7001';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', engine: 'GhostBrain', governor: governor.state.running }));
app.use('/talent', talentRouter);
app.use('/matchmaking', matchmakingRouter);
app.use('/gift-optimizer', giftOptimizerRouter);
app.use('/game-ai', gameAiRouter);
app.use('/litvyb/release-mediate', releaseRouter);
app.use('/governor', governorRouter);

// ── Bootstrap GhostBrain Governor ─────────────────────────────────────────
governor.registerAgent(new EconomyAgent());
governor.registerAgent(new SecurityAgent());
governor.registerAgent(new DiscoveryAgent());
governor.registerAgent(new EventAgent());
governor.registerAgent(new InfrastructureAgent());
governor.registerAgent(new TreasuryAgent());

governor.setMetricsFetcher(async (): Promise<PlatformMetrics> => {
  const res = await fetch(`${BACKEND_URL}/admin/stats`);
  if (!res.ok) throw new Error('backend stats unavailable');
  const base = await res.json() as {
    totalUsers: number; liveStreams: number;
    gstVolume24h: number; activeAgencies: number;
  };
  return {
    ...base,
    activeEvents:         0,
    pendingPayouts:       0,
    settlementQueueDepth: 0,
    flaggedAccounts:      0,
    rewardMultiplier:     1.0,
  };
});

governor.on('decision', d => logger.info({ msg: 'governor:decision', ...d }));
governor.on('cycle:complete', ({ cycle, decisions }) =>
  logger.debug({ msg: 'governor:cycle', cycle, decisions })
);

app.listen(PORT, () => {
  logger.info(`GhostBrain AI layer running on :${PORT}`);
  governor.start();
  logger.info('GhostBrain Governor started — 30s autonomous cycle active');
});

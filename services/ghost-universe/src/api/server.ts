/**
 * Ghost Universe Platform — Express 5 API Server
 *
 * Mounts all universe sub-system routers.
 * Attached to HTTP + WebSocket (ws) simultaneously for real-time support.
 */

import express, { type Application } from 'express';
import cors                          from 'cors';
import { createServer }              from 'http';
import { WebSocketServer }           from 'ws';

import { WorldEngine }        from '../world/WorldEngine.js';
import { AvatarEngine }       from '../avatar/AvatarEngine.js';
import { LandSystem }         from '../land/LandSystem.js';
import { AssetMarketplace }   from '../marketplace/AssetMarketplace.js';
import { NPCEngine }          from '../ai-npc/NPCEngine.js';
import { MultiplayerNetwork } from '../network/MultiplayerNetwork.js';
import { UniverseEconomy }    from '../economy/UniverseEconomy.js';
import { EventSystem }        from '../events/EventSystem.js';

import { worldsRouter } from './routes/worlds.js';
import { avatarsRouter } from './routes/avatars.js';
import { landRouter }   from './routes/land.js';
import { assetsRouter } from './routes/assets.js';
import { eventsRouter } from './routes/events.js';

export interface UniverseServices {
  worlds:   WorldEngine;
  avatars:  AvatarEngine;
  land:     LandSystem;
  market:   AssetMarketplace;
  npcs:     NPCEngine;
  network:  MultiplayerNetwork;
  economy:  UniverseEconomy;
  events:   EventSystem;
}

export function createApp(svc: UniverseServices): Application {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '512kb' }));

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: '@ghostchain/ghost-universe', version: '1.0.0' });
  });

  // ── Sub-system routers ────────────────────────────────────────────────────
  app.use('/worlds',  worldsRouter(svc.worlds));
  app.use('/avatars', avatarsRouter(svc.avatars));
  app.use('/land',    landRouter(svc.land, svc.economy));
  app.use('/assets',  assetsRouter(svc.market, svc.economy));
  app.use('/events',  eventsRouter(svc.events, svc.economy));

  // ── Economy stats ─────────────────────────────────────────────────────────
  app.get('/economy', async (_req, res) => {
    const stats = await svc.economy.getTreasuryStats();
    res.json({ stats: {
      l1BalanceGST:    stats.l1BalanceGST.toString(),
      l2VolumeGST:     stats.l2VolumeGST.toString(),
      l3VolumeGST:     stats.l3VolumeGST.toString(),
      platformFeesGST: stats.platformFeesGST.toString(),
      totalTxCount:    stats.totalTxCount,
    }});
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[ghost-universe] unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function buildServices(): UniverseServices {
  return {
    worlds:  WorldEngine.devnet(),
    avatars: AvatarEngine.devnet(),
    land:    LandSystem.devnet(),
    market:  new AssetMarketplace(),
    npcs:    NPCEngine.devnet(),
    network: MultiplayerNetwork.devnet(),
    economy: UniverseEconomy.devnet(),
    events:  EventSystem.devnet(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = parseInt(process.env.GHOST_UNIVERSE_PORT ?? '7700', 10);
  const svc  = buildServices();
  const app  = createApp(svc);
  const http = createServer(app);
  const wss  = new WebSocketServer({ server: http, path: '/universe/ws' });

  svc.network.attachServer(wss);

  http.listen(PORT, () => {
    console.log(`[ghost-universe] API     → http://localhost:${PORT}`);
    console.log(`[ghost-universe] WS      → ws://localhost:${PORT}/universe/ws`);
    console.log(`[ghost-universe] Health  → http://localhost:${PORT}/health`);
  });
}

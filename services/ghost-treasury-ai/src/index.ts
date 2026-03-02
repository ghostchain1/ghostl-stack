/**
 * index.ts — GhostTreasuryAI service entry point.
 *
 * Starts:
 *   • HTTP server (health, metrics, audit API)
 *   • Main orchestration loop
 *
 * Port: 7680 (next after ghostcontract-ai @ 7610)
 */

import express from 'express';
import { loadConfig } from './config.js';
import { logger }     from './logger.js';
import { registry }   from './metrics.js';
import { getChainClient } from './chain/client.js';
import { getTreasuryContracts } from './chain/contracts.js';
import { TreasuryOrchestrator } from './orchestrator.js';

const cfg = loadConfig();
const app = express();
app.disable('x-powered-by');
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ghost-treasury-ai', ts: new Date().toISOString() });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// ─── Status ───────────────────────────────────────────────────────────────────

app.get('/status', (_req, res) => {
  res.json({
    service:      'ghost-treasury-ai',
    autonomyTier: cfg.AUTONOMY_TIER,
    shadowMode:   cfg.SHADOW_MODE,
    cycleIntervalMs: cfg.CYCLE_INTERVAL_MS,
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown signal received', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info('ghost-treasury-ai starting', {
    autonomyTier:    cfg.AUTONOMY_TIER,
    shadowMode:      cfg.SHADOW_MODE,
    cycleIntervalMs: cfg.CYCLE_INTERVAL_MS,
    chainId:         cfg.CHAIN_ID_L1,
  });

  // Chain client + contracts
  const client    = await getChainClient(cfg);
  const contracts = getTreasuryContracts(cfg, client);

  // Stable token: default to native (address(0)). Override via STABLE_TOKEN_ADDRESS env.
  const stableToken = process.env['STABLE_TOKEN_ADDRESS'] ?? '0x0000000000000000000000000000000000000000';

  // Orchestrator
  const orchestrator = new TreasuryOrchestrator(cfg, contracts, stableToken);

  // Start HTTP server
  const server = app.listen(cfg.PORT, () => {
    logger.info(`HTTP server listening on :${cfg.PORT}`);
  });

  // Run orchestration loop
  const loop = async (): Promise<void> => {
    while (!shuttingDown) {
      try {
        await orchestrator.runCycle();
      } catch (err) {
        logger.error('orchestrator cycle error', { error: String(err) });
      }
      await new Promise<void>(resolve => setTimeout(resolve, cfg.CYCLE_INTERVAL_MS));
    }
    server.close();
  };

  void loop();
}

main().catch(err => {
  logger.error('fatal startup error', { error: String(err) });
  process.exit(1);
});

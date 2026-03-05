/**
 * @file src/index.js
 * @description GhostBrain Sovereign Autonomous Agent (GSA) — service entry point.
 *
 * Starts:
 *  - Content-addressable storage (creates dirs)
 *  - Event bus (NATS or HTTP fallback)
 *  - Agent self-registration with GhostBrain Core
 *  - HTTP API server on GSA_BIND:GSA_PORT (default 127.0.0.1:7850)
 *
 * Brand law: Ghost / GST / 18  — non-negotiable.
 * Routing law: L3→L2→L1 only — non-negotiable.
 * Safety: apply is DISABLED by default (GSA_APPLY_ENABLED=false).
 */

import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import { config }    from './config.js';
import { initBus, closeBus } from './events/bus.js';
import { createHttpServer }  from './api/http.js';

// ── Startup banner ────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════╗
║  GhostBrain Sovereign Autonomous Agent (GSA) v1.0.0  ║
║  Brand: ${config.brand.name} / ${config.brand.symbol} / ${config.brand.decimals} decimals                   ║
║  Agent: ${config.agentId.padEnd(42)}  ║
║  Apply: ${config.applyEnabled ? 'ENABLED' : 'DISABLED (default read-only)'.padEnd(43)}  ║
╚══════════════════════════════════════════════════════╝
`.trim());

// ── Storage dirs ──────────────────────────────────────────────────────────────
for (const sub of ['artifacts', 'bundles', 'scans', 'plans', 'executions', 'governor-tokens']) {
  mkdirSync(join(config.bundleDir, sub), { recursive: true });
}

// ── Event bus ─────────────────────────────────────────────────────────────────
await initBus();

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createHttpServer();
server.listen(config.port, config.bind, () => {
  console.log(`[gsa] HTTP API → http://${config.bind}:${config.port}`);
  console.log(`[gsa] GhostBrain Core → ${config.ghostbrainUrl}`);
  console.log(`[gsa] Repo root → ${config.repoRoot}`);
  console.log('[gsa] Ready.');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`[gsa] ${signal} received — shutting down`);
  server.close(async () => {
    await closeBus();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  err => { console.error('[gsa] uncaught:', err); });
process.on('unhandledRejection', err => { console.error('[gsa] unhandled rejection:', err); });

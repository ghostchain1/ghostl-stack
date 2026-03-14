/**
 * GhostChain Protocol Architect — Entry point
 *
 * Phase-3 autonomous AI-driven DeFi protocol factory service.
 *
 * Default port : 7910  (PROTOCOL_ARCHITECT_PORT env to override)
 * Default bind : 127.0.0.1 (PROTOCOL_ARCHITECT_BIND env to override)
 *
 * Endpoints:
 *   POST /api/v1/design   — design + generate a full protocol suite
 *   POST /api/v1/generate — generate a single contract
 *   GET  /api/v1/scan     — scan contracts/src/ for protocol coverage gaps
 *   POST /api/v1/build    — trigger forge build  (requires ALLOW_FORGE_EXEC=true)
 *   GET  /healthz         — liveness probe
 */

import { buildApp } from "./app.js";

const PORT = Number(process.env.PROTOCOL_ARCHITECT_PORT ?? "7910");
const BIND = process.env.PROTOCOL_ARCHITECT_BIND ?? "127.0.0.1";

const app = buildApp();

try {
  await app.listen({ port: PORT, host: BIND });
  app.log.info({ bind: BIND, port: PORT }, "ghost-protocol-architect started");
} catch (err) {
  app.log.error(err, "ghost-protocol-architect failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down");
  await app.close();
  process.exit(0);
});

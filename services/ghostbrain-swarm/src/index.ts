/**
 * GhostBrain Swarm Coordinator — Entry Point
 *
 * Boots the AI swarm coordinator service.
 * Default port : 7960  (SWARM_PORT env to override)
 * Default bind : 127.0.0.1 (SWARM_BIND env to override — set 0.0.0.0 in Docker)
 *
 * Agent network (default endpoints):
 *   GhostBrain Core        → http://127.0.0.1:7900
 *   Ghost Protocol Architect → http://127.0.0.1:7910
 *   Ghost DeFi Architect   → http://127.0.0.1:7920
 *   Ghost Governor AI      → http://127.0.0.1:7930
 *   Ghost Contract Engine  → http://127.0.0.1:7940
 *   Ghost Infra Controller → http://127.0.0.1:7950
 */

import { buildApp }           from "./app.js";
import { initRegistry, startHeartbeat, stopHeartbeat } from "./swarm.js";
import { SWARM_PORT, SWARM_BIND } from "./config.js";

initRegistry();

const app = buildApp();

try {
  await app.listen({ port: SWARM_PORT, host: SWARM_BIND });
  startHeartbeat();
  app.log.info({ bind: SWARM_BIND, port: SWARM_PORT }, "ghostbrain-swarm started");
} catch (err) {
  app.log.error(err, "ghostbrain-swarm failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down");
  stopHeartbeat();
  await app.close();
  process.exit(0);
});

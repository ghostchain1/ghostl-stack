/**
 * GhostBrain Core — Entry point
 *
 * Boots the GhostBrain central autonomous coordination service.
 *
 * Default port : 7900  (GHOSTBRAIN_PORT env to override)
 * Default bind : 127.0.0.1 (GHOSTBRAIN_BIND env to override — set 0.0.0.0 in Docker)
 *
 * Chain-ID env vars (required at runtime for routing-law metric labels):
 *   GHOSTAI_L1_CHAIN_ID  e.g. 14000101
 *   GHOSTAI_L2_CHAIN_ID  e.g. 901
 *   GHOSTAI_L3_CHAIN_ID  e.g. 903
 */

import { buildApp }       from "./app.js";
import { attachWsServer } from "./routes/ws.js";

const PORT = Number(process.env.GHOSTBRAIN_PORT ?? "7900");
const BIND = process.env.GHOSTBRAIN_BIND ?? "127.0.0.1";

const app = buildApp();
let wss: ReturnType<typeof attachWsServer> | undefined;

try {
  await app.listen({ port: PORT, host: BIND });

  // Attach WebSocket server to the same port (path: /ws)
  wss = attachWsServer(app.server);
  app.log.info({ bind: BIND, port: PORT, wsPath: "/ws" }, "ghostbrain-core started");
} catch (err) {
  app.log.error(err, "ghostbrain-core failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down");
  wss?.close();
  await app.close();
  process.exit(0);
});


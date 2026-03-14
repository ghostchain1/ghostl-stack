/**
 * GhostBrain Memory — Entry Point
 *
 * Federated AI memory store for the entire GhostBrain cluster.
 *
 * Default port : 7903  (MEMORY_PORT env)
 * Default bind : 127.0.0.1 (MEMORY_BIND env — set 0.0.0.0 in Docker)
 *
 * Env:
 *   MEMORY_DIR  — disk storage path (default: /tmp/ghostbrain-fed-memory)
 */

import { buildApp }            from "./app.js";
import { hydrateFromDisk }     from "./memory_federation.js";
import { hydrateVectors }      from "./vector_memory.js";
import { hydrateLearnMemory }  from "./learning_memory.js";
import { hydrateFixMemory }    from "./fix_memory.js";

const PORT = Number(process.env.MEMORY_PORT ?? "7903");
const BIND = process.env.MEMORY_BIND ?? "127.0.0.1";

const app = buildApp();

// Hydrate all memory layers from disk in parallel
await Promise.all([
  hydrateFromDisk(),
  hydrateVectors(),
  hydrateLearnMemory(),
  hydrateFixMemory(),
]);

try {
  await app.listen({ port: PORT, host: BIND });
  app.log.info({ bind: BIND, port: PORT }, "ghostbrain-memory started");
} catch (err) {
  app.log.error(err, "ghostbrain-memory failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM — shutting down ghostbrain-memory");
  await app.close();
  process.exit(0);
});

/**
 * GhostChain Sovereign AI Network Governor
 * Port: 7930
 *
 * Starts the Fastify HTTP server (status/health routes) and launches the
 * continuous governor loop (analyzeNetwork → propose → repeat).
 *
 * Per GhostChain governance rules: all AI-generated proposals require
 * human ratification before on-chain execution.
 */
import { buildApp }     from "./app.js";
import { runGovernor, stopGovernor } from "./governor-core.js";

const PORT = parseInt(process.env.GOVERNOR_PORT ?? "7930", 10);
const HOST = process.env.GOVERNOR_HOST ?? "0.0.0.0";

async function start(): Promise<void> {
  const app = buildApp();

  await app.listen({ port: PORT, host: HOST });
  console.log(`[ghost-governor-ai] HTTP server listening on ${HOST}:${PORT}`);

  // Graceful shutdown
  const shutdown = async () => {
    stopGovernor();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT",  shutdown);

  // Start the continuous governor loop (non-blocking via background async task)
  runGovernor().catch(err => {
    console.error("[governor] fatal error in governor loop:", err);
    process.exit(1);
  });
}

start();

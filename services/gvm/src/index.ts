// GVM — entry point
// GhostChain Virtual Machine — EVM-compatible execution layer (chainId 9001).

import { getEngine } from "./vm.js";
import { createServer } from "./server.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  logger.info(
    { chainId: config().GVM_CHAIN_ID, port: config().PORT, routingLaw: config().ENFORCE_ROUTING_LAW },
    "GVM starting",
  );

  // ─── Init EVM engine ──────────────────────────────────────────────────────────
  const engine = await getEngine();

  // ─── Block sealer loop ────────────────────────────────────────────────────────
  // Automatically seal a new block every GVM_BLOCK_TIME_MS milliseconds.
  const sealInterval = setInterval(async () => {
    try {
      const block = await engine.sealBlock();
      logger.debug(
        { blockNumber: block.number, stateRoot: block.stateRoot },
        "GVM block sealed",
      );
    } catch (err) {
      logger.error({ err }, "GVM block sealer error");
    }
  }, config().GVM_BLOCK_TIME_MS);
  sealInterval.unref();

  // ─── HTTP / JSON-RPC server ───────────────────────────────────────────────────
  await createServer(engine);

  // ─── Graceful shutdown ────────────────────────────────────────────────────────
  const shutdown = (sig: string) => {
    logger.info({ sig }, "GVM shutting down");
    clearInterval(sealInterval);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("GVM fatal error", err);
  process.exit(1);
});

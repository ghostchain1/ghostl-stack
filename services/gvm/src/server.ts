// GVM — HTTP/JSON-RPC server (Fastify)

import Fastify from "fastify";
import { handleRpc } from "./rpc.js";
import type { GvmExecutionEngine } from "./vm.js";
import type { JsonRpcRequest } from "./types.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export async function createServer(engine: GvmExecutionEngine) {
  const app = Fastify({ logger: false });

  // ─── Health ────────────────────────────────────────────────────────────────

  app.get("/health", async (_req, reply) => {
    const block = engine.latestBlock;
    const stale = Date.now() / 1000 - block.timestamp;
    const ok    = stale < 60;   // healthy if latest block < 60s old

    return reply.status(ok ? 200 : 503).send({
      status:      ok ? "healthy" : "degraded",
      chainId:     config().GVM_CHAIN_ID,
      latestBlock: block.number,
      stateRoot:   block.stateRoot,
      uptimeMs:    engine.uptimeMs,
    });
  });

  // ─── Metrics (Prometheus text format) ────────────────────────────────────────

  app.get("/metrics", async (_req, reply) => {
    const block = engine.latestBlock;
    const lines = [
      `# HELP gvm_latest_block_number Latest sealed GVM block number`,
      `# TYPE gvm_latest_block_number gauge`,
      `gvm_latest_block_number ${block.number}`,
      `# HELP gvm_uptime_ms GVM service uptime in milliseconds`,
      `# TYPE gvm_uptime_ms counter`,
      `gvm_uptime_ms ${engine.uptimeMs}`,
      `# HELP gvm_chain_id GVM chain ID`,
      `# TYPE gvm_chain_id gauge`,
      `gvm_chain_id ${config().GVM_CHAIN_ID}`,
    ].join("\n");

    return reply.header("content-type", "text/plain; version=0.0.4").send(lines + "\n");
  });

  // ─── JSON-RPC ─────────────────────────────────────────────────────────────────

  app.post<{ Body: JsonRpcRequest | JsonRpcRequest[] }>("/", async (req, reply) => {
    const body = req.body;

    if (Array.isArray(body)) {
      // Batch request
      const results = await Promise.all(body.map((r) => handleRpc(r, engine)));
      return reply.send(results);
    }

    const result = await handleRpc(body, engine);
    return reply.send(result);
  });

  // ─── Start ────────────────────────────────────────────────────────────────────

  await app.listen({ port: config().PORT, host: config().HOST });
  logger.info(
    { port: config().PORT, chainId: config().GVM_CHAIN_ID },
    "GVM JSON-RPC server listening",
  );

  return app;
}

import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Registry, collectDefaultMetrics, Gauge } from "prom-client";
import { checkL1, checkRollup, evaluate, type SentinelResult } from "./checks.js";
import type { Config } from "./config.js";

export async function buildServer(cfg: Config) {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined
    }
  });

  // ── Security & rate-limiting ──────────────────────────────────────────────
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  // ── Prometheus registry ───────────────────────────────────────────────────
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const gOk = new Gauge({
    name: "ghost_sync_ok",
    help: "1 if the full GhostStack (L1+L2+L3) is in sync, 0 otherwise",
    registers: [registry]
  });

  const gRouting = new Gauge({
    name: "ghost_routing_law_ok",
    help: "1 if routing law (L3→L2→L1) is satisfied by configuration, 0 if violated",
    registers: [registry]
  });

  const gL1Syncing = new Gauge({
    name: "ghost_l1_syncing",
    help: "1 if L1 reports eth_syncing != false",
    registers: [registry]
  });

  const gL1Peers = new Gauge({
    name: "ghost_l1_peer_count",
    help: "L1 peer count from net_peerCount",
    registers: [registry]
  });

  const gLag = new Gauge({
    name: "ghost_layer_head_lag_seconds",
    help: "Head block timestamp lag in seconds (now - headTime)",
    labelNames: ["layer"] as const,
    registers: [registry]
  });

  const gSafeLag = new Gauge({
    name: "ghost_layer_safe_lag_seconds",
    help: "Safe block timestamp lag in seconds (now - safeTime)",
    labelNames: ["layer"] as const,
    registers: [registry]
  });

  const gHeadBlock = new Gauge({
    name: "ghost_layer_head_block",
    help: "Latest head block number",
    labelNames: ["layer"] as const,
    registers: [registry]
  });

  const gSafeBlock = new Gauge({
    name: "ghost_layer_safe_block",
    help: "Latest safe block number",
    labelNames: ["layer"] as const,
    registers: [registry]
  });

  // ── State ─────────────────────────────────────────────────────────────────
  let last: SentinelResult | null = null;
  let pollCount = 0;

  // ── Poll loop ─────────────────────────────────────────────────────────────
  async function pollOnce(): Promise<void> {
    const [l1, l2, l3] = await Promise.all([
      checkL1(cfg.L1_RPC_URL),
      checkRollup("L2", cfg.L2_RPC_URL),
      checkRollup("L3", cfg.L3_RPC_URL)
    ]);

    const res = evaluate(l1, l2, l3, {
      maxHeadLagSec: cfg.MAX_HEAD_LAG_SEC,
      maxSafeLagSec: cfg.MAX_SAFE_LAG_SEC,
      enforceRoutingLaw: cfg.ENFORCE_ROUTING_LAW,
      l1HostnameHint: cfg.L1_RPC_HOSTNAME_HINT,
      l2RpcUrl: cfg.L2_RPC_URL,
      l3RpcUrl: cfg.L3_RPC_URL
    });

    last = res;
    pollCount++;

    // ── Update metrics ──
    gOk.set(res.ok ? 1 : 0);
    gRouting.set(res.routingLawOk ? 1 : 0);
    gL1Syncing.set(l1.syncing ? 1 : 0);

    if (typeof l1.peerCount === "number") gL1Peers.set(l1.peerCount);
    if (typeof l1.headBlock === "number") gHeadBlock.labels("L1").set(l1.headBlock);

    if (typeof l2.headTime === "number") gLag.labels("L2").set(l2.now - l2.headTime);
    if (typeof l2.safeTime === "number") gSafeLag.labels("L2").set(l2.now - l2.safeTime);
    if (typeof l2.headBlock === "number") gHeadBlock.labels("L2").set(l2.headBlock);
    if (typeof l2.safeBlock === "number") gSafeBlock.labels("L2").set(l2.safeBlock);

    if (typeof l3.headTime === "number") gLag.labels("L3").set(l3.now - l3.headTime);
    if (typeof l3.safeTime === "number") gSafeLag.labels("L3").set(l3.now - l3.safeTime);
    if (typeof l3.headBlock === "number") gHeadBlock.labels("L3").set(l3.headBlock);
    if (typeof l3.safeBlock === "number") gSafeBlock.labels("L3").set(l3.safeBlock);

    // ── Structured logging ──
    if (!res.ok) {
      app.log.warn({ reasons: res.reasons, poll: pollCount }, "ghost-sync-sentinel: UNHEALTHY");
    } else if (pollCount % 6 === 0) {
      // Log healthy state every ~60s (6 × 10s polls) to confirm liveness
      app.log.info(
        {
          l1_head: l1.headBlock,
          l2_head: l2.headBlock,
          l2_safe: l2.safeBlock,
          l3_head: l3.headBlock,
          l3_safe: l3.safeBlock,
          poll: pollCount
        },
        "ghost-sync-sentinel: OK"
      );
    } else {
      app.log.debug({ poll: pollCount }, "ghost-sync-sentinel: OK");
    }
  }

  const timer = setInterval(() => {
    pollOnce().catch((e: unknown) => app.log.error(e, "poll failed"));
  }, cfg.POLL_INTERVAL_MS);

  app.addHook("onClose", async () => clearInterval(timer));

  // ── Routes ────────────────────────────────────────────────────────────────

  app.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!last) {
      reply.code(503);
      return { status: "starting", message: "Initial poll not yet complete" };
    }
    if (!last.ok) {
      reply.code(503);
      return { status: "unhealthy", reasons: last.reasons };
    }
    return { status: "healthy" };
  });

  app.get("/status", async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!last) {
      reply.code(503);
      return { status: "starting" };
    }
    return last;
  });

  app.get("/metrics", async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });

  // ── Prime on boot ─────────────────────────────────────────────────────────
  pollOnce().catch((e: unknown) => app.log.error(e, "initial poll failed"));

  return app;
}

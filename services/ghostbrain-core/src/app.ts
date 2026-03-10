/**
 * GhostBrain Core — Fastify application factory
 *
 * Builds and returns the Fastify app with all routes registered.
 * Separated from index.ts so tests can import buildApp() without binding a port.
 *
 * Integration surface:
 *   ← POST /api/v1/signals          ghostbrain-gsa event bus (BrainMessage<T>)
 *   ← POST /api/v1/agents/register  agent self-registration
 *   → POST /api/v1/gsa/*            ghostbrain-core → ghostbrain-gsa commands
 *   ↔ HMAC-SHA256                   mutual auth via CONTROL_PLANE_HMAC_SECRET
 */

import Fastify         from "fastify";
import { statusRoutes  } from "./routes/status.js";
import { actionRoutes  } from "./routes/actions.js";
import { signalsRoutes } from "./routes/signals.js";
import { gsaRoutes     } from "./routes/gsa.js";
import { rpcRoutes     } from "./routes/rpc.js";
import { thinkRoutes   } from "./routes/think.js";
import { memoryRoutes    } from "./routes/memory.js";
import { cognitionRoutes  } from "./routes/cognition.js";
import { clusterPeerRoutes }   from "./routes/cluster_peer.js";
import { kernelRoutes }        from "./routes/kernel.js";
import { orchestratorRoutes }  from "./routes/orchestrator.js";
import { protectionRoutes }    from "./routes/protection.js";
import { observabilityRoutes } from "./routes/observability.js";
import { predictiveRoutes }    from "./routes/predictive.js";
import { simulatorRoutes }     from "./routes/simulator.js";
import { benchmarkRoutes }     from "./routes/benchmark.js";
import { brainRoutes }         from "./routes/brain.js";
import { blockchainRoutes }    from "./routes/blockchain.js";
import { aiRoutes }            from "./routes/ai.js";
import { hypercoreRoutes }     from "./routes/hypercore.js";
import { hmacAuthPlugin } from "./middleware/hmac.js";
import { rateLimitPlugin } from "./middleware/rateLimit.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  // ── Content-type parsing ─────────────────────────────────────────────────
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try { done(null, JSON.parse(body as string)); }
      catch (err: unknown) { done(err as Error); }
    },
  );

  // ── Rate limiting (applied first — before auth) ──────────────────────────
  app.register(rateLimitPlugin);

  // ── Auth middleware (HMAC — applied to all routes except /healthz /status) ─
  app.register(hmacAuthPlugin);

  // ── Public probe routes (no auth) ────────────────────────────────────────
  app.register(statusRoutes);

  // ── Authenticated routes ─────────────────────────────────────────────────
  app.register(actionRoutes);
  app.register(signalsRoutes);
  app.register(gsaRoutes);
  app.register(rpcRoutes);
  app.register(thinkRoutes);

  // ── Cognitive memory + infrastructure intelligence ────────────────────────
  app.register(memoryRoutes);
  app.register(cognitionRoutes);

  // ── Cluster mesh peer routes ─────────────────────────────────────────────
  app.register(clusterPeerRoutes);

  // ── GBA-OS subsystem routes ───────────────────────────────────────────────
  app.register(kernelRoutes);
  app.register(orchestratorRoutes);
  app.register(protectionRoutes);
  app.register(observabilityRoutes);
  app.register(predictiveRoutes);

  // ── Infrastructure Simulator — policy + sim-gate + execution ────────────
  app.register(simulatorRoutes);
  // ── Benchmark harness + audit log ─────────────────────────────────────────
  app.register(benchmarkRoutes);
  // ── AI Memory System + Agent API ──────────────────────────────────────────
  app.register(brainRoutes);
  // ── Blockchain Intelligence + Validator + RPC + Memory Graph ────────────────
  app.register(blockchainRoutes);
  // ── Cognitive Engine — AI reasoning, planning, strategy, agent coordination ─
  app.register(aiRoutes);
  // ── HyperCore — Layer 5 strategic AI: LLM reasoning, DevOps AI, Blockchain AI ─
  app.register(hypercoreRoutes);
  return app;
}

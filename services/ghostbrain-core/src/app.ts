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
import { hmacAuthPlugin } from "./middleware/hmac.js";

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

  return app;
}

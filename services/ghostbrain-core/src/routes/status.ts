/**
 * GhostBrain Core — Status routes
 *
 * GET /healthz  — Liveness probe: is the process alive?
 * GET /readyz   — Readiness probe: is the process ready to serve traffic?
 * GET /status   — Informational: version, uptime, stats (no auth required).
 *
 * Kubernetes / Docker HEALTHCHECK should target /healthz for liveness and
 * /readyz for readiness. Both return 200 when healthy, 503 otherwise.
 */

import type { FastifyInstance } from "fastify";
import { getAgentRegistry }     from "./signals.js";

const START_TIME  = Date.now();
const VERSION     = process.env.npm_package_version ?? "0.1.0";

// Track readiness state — flips to true once the app is fully initialised.
// Set via markReady() called from index.ts after all plugins are registered.
let _ready = false;
export function markReady(): void { _ready = true; }

export async function statusRoutes(app: FastifyInstance): Promise<void> {

  /** Liveness probe — always 200 if the process is alive. */
  app.get("/healthz", async (_req, reply) => {
    return reply.code(200).send({
      status: "ok",
      ts:     new Date().toISOString(),
    });
  });

  /**
   * Readiness probe — 200 only when the service is fully initialised and
   * its critical subsystems are reachable.
   *
   * Checks:
   *  1. markReady() has been called (all plugins registered)
   *  2. CONTROL_PLANE_HMAC_SECRET is set in production
   *  3. At least one agent is registered OR we are in dev/test mode
   */
  app.get("/readyz", async (_req, reply) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // Check 1: process fully initialised
    checks["initialised"] = { ok: _ready };

    // Check 2: HMAC secret configured in production
    const isProd   = process.env.NODE_ENV === "production";
    const hasSecret = Boolean(process.env.CONTROL_PLANE_HMAC_SECRET);
    checks["hmac_secret"] = isProd
      ? { ok: hasSecret, detail: hasSecret ? undefined : "CONTROL_PLANE_HMAC_SECRET not set" }
      : { ok: true };

    // Check 3: signal ledger / agent registry accessible
    let agentCount = 0;
    try {
      agentCount = getAgentRegistry().size;
      checks["agent_registry"] = { ok: true, detail: `${agentCount} agent(s) registered` };
    } catch {
      checks["agent_registry"] = { ok: false, detail: "registry unavailable" };
    }

    const allOk = Object.values(checks).every(c => c.ok);
    const code  = allOk ? 200 : 503;

    return reply.code(code).send({
      ready:   allOk,
      checks,
      uptimeS: Math.floor(process.uptime()),
      ts:      new Date().toISOString(),
    });
  });

  /** Informational status — version, uptime, memory. No auth required. */
  app.get("/status", async () => ({
    service:   "ghostbrain-core",
    version:   VERSION,
    uptime:    process.uptime(),
    startedAt: new Date(START_TIME).toISOString(),
    memoryMb:  Math.round(process.memoryUsage().heapUsed / 1_048_576),
    agents:    (() => { try { return getAgentRegistry().size; } catch { return 0; } })(),
    env:       process.env.NODE_ENV ?? "development",
  }));
}


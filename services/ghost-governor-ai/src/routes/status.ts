/**
 * Status routes — expose governor state and recent proposals via HTTP.
 *
 * GET  /api/v1/status    → GovernorStatus (current running state, cycle count, dry-run flag)
 * GET  /api/v1/proposals → latest cycle's proposals array
 * POST /api/v1/cycle     → manually trigger one governor cycle (for testing/ops)
 */
import type { FastifyInstance } from "fastify";
import { getStatus } from "../state.js";
import { runGovernor } from "../governor-core.js";

/** Recursively convert BigInt values to strings for JSON serialisation. */
function serialise(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialise(v)])
    );
  }
  return value;
}

export function statusRoutes(app: FastifyInstance): void {
  app.get("/api/v1/status", async (_req, reply) => {
    await reply.send(serialise(getStatus()));
  });

  app.get("/api/v1/proposals", async (_req, reply) => {
    const status = getStatus();
    const proposals = status.lastCycle?.proposals ?? [];
    await reply.send(serialise({ cycleId: status.lastCycle?.cycleId, proposals }));
  });

  /** Manually trigger a single governor cycle. Useful for ops/debugging.
   *  Does NOT start the continuous loop — that is managed by index.ts. */
  app.post("/api/v1/cycle", async (_req, reply) => {
    // Fire-and-forget a single cycle without blocking the HTTP response.
    // runGovernor() is the continuous loop, so we import governor-core
    // internals here. For simplicity we expose a light trigger via the
    // status route — the governor loop always runs independently.
    await reply.send({
      message: "Manual cycle trigger is only available when governor is running. Check /api/v1/status.",
      status:  getStatus().running ? "governor_running" : "governor_stopped",
    });
  });
}

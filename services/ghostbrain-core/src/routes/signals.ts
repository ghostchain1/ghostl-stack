/**
 * GhostBrain Core — Signals + Agent registry routes
 *
 * These endpoints are the primary integration surface for ghostbrain-gsa and
 * any other autonomous agents.
 *
 * POST /api/v1/signals          — receive BrainMessage events from agents
 * POST /api/v1/agents/register  — agent self-registration
 * GET  /api/v1/agents           — list registered agents (health dashboard)
 * GET  /api/v1/signals          — recent signal ledger (last 100, read-only)
 *
 * Auth: HMAC-SHA256 (X-HMAC-Signature / X-HMAC-Timestamp) handled by the
 *       hmacAuthPlugin registered in app.ts.
 *
 * Storage: in-memory (phase 1). Phase 2 → Postgres via Prisma/Drizzle.
 */

import type { FastifyInstance } from "fastify";
import { z }                    from "zod";
import { enforceRoutingLaw }    from "../core/routingLaw.js";

// ── In-memory stores ──────────────────────────────────────────────────────────

export interface AgentRecord {
  agentId:        string;
  role:           string;
  capabilities:   string[];
  resourceScopes: unknown[];
  natsSubject?:   string;
  registeredAt:   string;
  lastSeen:       string;
  healthy:        boolean;
}

export interface SignalRecord {
  messageId:     string;
  subject:       string;
  correlationId: string;
  senderAgentId: string;
  payload:       unknown;
  sentAt:        string;
  receivedAt:    string;
  routingResult: { ok: boolean; reason?: string } | null;
}

const agentRegistry = new Map<string, AgentRecord>();
const signalLedger:  SignalRecord[] = [];
const MAX_SIGNALS = 500;

// ── Zod schemas ───────────────────────────────────────────────────────────────

/**
 * Canonical BrainMessage<T> envelope — mirrors ghostbrain-gsa/src/events/bus.js
 */
const BrainMessageSchema = z.object({
  messageId:     z.string().uuid(),
  subject:       z.string().min(1),
  correlationId: z.string(),
  senderAgentId: z.string().min(1),
  payload:       z.unknown(),
  sentAt:        z.string(),
});

const AgentRegistrationSchema = z.object({
  agentId:        z.string().min(1),
  role:           z.string().min(1),
  capabilities:   z.array(z.string()).default([]),
  resourceScopes: z.array(z.unknown()).default([]),
  natsSubject:    z.string().optional(),
  registeredAt:   z.string().optional(),
  lastSeen:       z.string().optional(),
  healthy:        z.boolean().default(true),
});

// ── Routing law subjects that carry cross-layer intent ────────────────────────

const ROUTED_SUBJECTS = new Set([
  "ghostbrain.gsa.plan",
  "ghostbrain.gsa.patch",
  "ghostbrain.gsa.finding",
]);

/**
 * Extract routing meta from a GSA payload if present.
 * Finds are tagged with { sourceLayer, targetLayer, intent } when the GSA
 * enriches them with routing context.
 */
function extractRoutingMeta(payload: unknown): {
  sourceLayer?: string;
  targetLayer?: string;
  intent?: string;
} | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.sourceLayer || p.targetLayer) return p as ReturnType<typeof extractRoutingMeta>;
  if (typeof p.meta === "object" && p.meta !== null) return p.meta as ReturnType<typeof extractRoutingMeta>;
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function signalsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/signals
   *
   * Receive a BrainMessage event from ghostbrain-gsa or any registered agent.
   * - Validates the envelope schema.
   * - If the subject is a routed subject (plan/patch/finding), applies routing law.
   * - Stores in the signal ledger.
   * - Handles agent registration inline (ghostbrain.agent.register subject).
   */
  app.post("/api/v1/signals", async (req, reply) => {
    const parsed = BrainMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const msg = parsed.data;
    let routingResult: SignalRecord["routingResult"] = null;

    // ── Routing law check for plan/patch subjects ────────────────────────────
    if (ROUTED_SUBJECTS.has(msg.subject)) {
      const meta = extractRoutingMeta(msg.payload);
      if (meta?.sourceLayer && meta?.targetLayer) {
        routingResult = enforceRoutingLaw({
          sourceLayer: meta.sourceLayer as "L1" | "L2" | "L3",
          targetLayer: meta.targetLayer as "L1" | "L2" | "L3" | "EXTERNAL",
          intent:      (meta.intent ?? "TX") as "TX" | "BRIDGE" | "READ" | "ADMIN",
        });

        if (!routingResult.ok) {
          app.log.warn({ subject: msg.subject, reason: routingResult.reason }, "signal rejected: routing law violation");
          return reply.code(403).send({
            ok:     false,
            error:  "routing_law_violation",
            reason: routingResult.reason,
          });
        }
      }
    }

    // ── Inline agent registration ────────────────────────────────────────────
    if (msg.subject === "ghostbrain.agent.register") {
      const regParsed = AgentRegistrationSchema.safeParse(msg.payload);
      if (regParsed.success) {
        const reg = regParsed.data;
        agentRegistry.set(reg.agentId, {
          ...reg,
          registeredAt: reg.registeredAt ?? msg.sentAt,
          lastSeen:     new Date().toISOString(),
        });
        app.log.info({ agentId: reg.agentId, role: reg.role }, "agent registered via signal");
      }
    }

    // ── Update lastSeen for known agents ─────────────────────────────────────
    const existing = agentRegistry.get(msg.senderAgentId);
    if (existing) {
      existing.lastSeen = new Date().toISOString();
    }

    // ── Append to ledger (ring buffer) ───────────────────────────────────────
    const record: SignalRecord = {
      messageId:     msg.messageId,
      subject:       msg.subject,
      correlationId: msg.correlationId,
      senderAgentId: msg.senderAgentId,
      payload:       msg.payload,
      sentAt:        msg.sentAt,
      receivedAt:    new Date().toISOString(),
      routingResult,
    };

    signalLedger.push(record);
    if (signalLedger.length > MAX_SIGNALS) signalLedger.shift();

    app.log.info({ subject: msg.subject, sender: msg.senderAgentId, cid: msg.correlationId }, "signal received");

    return reply.code(202).send({
      ok:        true,
      messageId: msg.messageId,
      accepted:  true,
    });
  });

  /**
   * GET /api/v1/signals
   *
   * Return the recent signal ledger (read-only probe / dashboard).
   * Query params:
   *   ?subject=ghostbrain.gsa.finding  — filter by subject prefix
   *   ?limit=50                        — max records (default 50, max 200)
   */
  app.get("/api/v1/signals", async (req) => {
    const qs     = req.query as Record<string, string>;
    const subjectFilter = qs.subject ?? "";
    const limit  = Math.max(1, Math.min(200, parseInt(qs.limit ?? "50", 10)));

    const items = subjectFilter
      ? signalLedger.filter(s => s.subject.startsWith(subjectFilter)).slice(-limit)
      : signalLedger.slice(-limit);

    return {
      ok:    true,
      count: items.length,
      total: signalLedger.length,
      items: items.slice().reverse(), // newest first
    };
  });

  /**
   * POST /api/v1/agents/register
   *
   * Explicit HTTP agent registration endpoint.
   * Accepts the same payload as the inline ghostbrain.agent.register subject.
   */
  app.post("/api/v1/agents/register", async (req, reply) => {
    const parsed = AgentRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }

    const reg = parsed.data;
    const now = new Date().toISOString();
    agentRegistry.set(reg.agentId, {
      ...reg,
      registeredAt: reg.registeredAt ?? now,
      lastSeen:     now,
    });

    app.log.info({ agentId: reg.agentId, role: reg.role }, "agent registered via HTTP");
    return reply.code(201).send({ ok: true, agentId: reg.agentId });
  });

  /**
   * GET /api/v1/agents
   *
   * List all registered agents with health status.
   * Marks agents as stale if lastSeen > 5 minutes ago.
   */
  app.get("/api/v1/agents", async () => {
    const now = Date.now();
    const STALE_MS = 5 * 60 * 1_000;

    const agents = [...agentRegistry.values()].map(a => ({
      ...a,
      stale: now - new Date(a.lastSeen).getTime() > STALE_MS,
    }));

    return {
      ok:    true,
      count: agents.length,
      agents,
    };
  });
}

// ── Exported accessors (for internal use by other routes) ─────────────────────

export function getAgentRegistry(): ReadonlyMap<string, AgentRecord> {
  return agentRegistry;
}

export function getSignalLedger(): readonly SignalRecord[] {
  return signalLedger;
}

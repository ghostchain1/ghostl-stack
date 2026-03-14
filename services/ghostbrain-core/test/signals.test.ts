/**
 * services/ghostbrain-core/test/signals.test.ts
 *
 * Integration tests for the ghostbrain-core ↔ ghostbrain-gsa integration
 * surface:
 *
 *   POST /api/v1/signals          — receive BrainMessage events from GSA
 *   POST /api/v1/agents/register  — agent self-registration
 *   GET  /api/v1/agents           — agent registry
 *   GET  /api/v1/signals          — signal ledger
 *
 * Uses the real Fastify app (no mock — builds the full stack).
 * CONTROL_PLANE_HMAC_SECRET is intentionally NOT set so the HMAC middleware
 * falls back to open-dev mode (NODE_ENV = 'test').
 *
 * Run: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function brainMessage(overrides: Record<string, unknown> = {}) {
  return {
    messageId:     crypto.randomUUID(),
    subject:       overrides.subject ?? "ghostbrain.gsa.finding",
    correlationId: crypto.randomUUID(),
    senderAgentId: "ghostbrain-gsa-test-1",
    payload:       overrides.payload ?? { severity: "medium", message: "npm vuln" },
    sentAt:        new Date().toISOString(),
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  // Ensure open-dev auth mode; use NODE_ENV=test to skip pino-pretty transport
  delete process.env.CONTROL_PLANE_HMAC_SECRET;
  (process.env as Record<string, string>).NODE_ENV = "test";
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ── POST /api/v1/signals ──────────────────────────────────────────────────────

describe("POST /api/v1/signals", () => {
  it("accepts a well-formed BrainMessage", async () => {
    const r = await app.inject({
      method:  "POST",
      url:     "/api/v1/signals",
      payload: brainMessage(),
    });
    expect(r.statusCode).toBe(202);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.accepted).toBe(true);
    expect(body.messageId).toBeTypeOf("string");
  });

  it("rejects a malformed BrainMessage (missing senderAgentId)", async () => {
    const r = await app.inject({
      method:  "POST",
      url:     "/api/v1/signals",
      payload: { messageId: "not-a-uuid", subject: "test" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().ok).toBe(false);
  });

  it("accepts ghostbrain.agent.register subject and registers the agent", async () => {
    const agentId = `test-agent-${Date.now()}`;
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.agent.register",
        payload: {
          agentId,
          role:          "auditor",
          capabilities:  ["scan", "verify"],
          resourceScopes: [],
          healthy:       true,
        },
      }),
    });
    expect(r.statusCode).toBe(202);

    // Verify the agent is now in the registry
    const agents = await app.inject({ method: "GET", url: "/api/v1/agents" });
    const body   = agents.json();
    expect(body.ok).toBe(true);
    const found = body.agents.find((a: { agentId: string }) => a.agentId === agentId);
    expect(found).toBeDefined();
    expect(found.role).toBe("auditor");
  });

  it("accepts a finding signal without routing meta (no routing-law gate)", async () => {
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.gsa.finding",
        payload: { severity: "high", rule: "test_rule" },
      }),
    });
    expect(r.statusCode).toBe(202);
  });

  it("blocks a plan signal that violates routing law (L3→L1)", async () => {
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.gsa.plan",
        payload: {
          sourceLayer: "L3",
          targetLayer: "L1",
          intent:      "TX",
        },
      }),
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe("routing_law_violation");
  });

  it("accepts a plan signal that satisfies routing law (L3→L2)", async () => {
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.gsa.plan",
        payload: {
          sourceLayer: "L3",
          targetLayer: "L2",
          intent:      "TX",
        },
      }),
    });
    expect(r.statusCode).toBe(202);
  });

  it("accepts a patch signal with meta.sourceLayer/targetLayer", async () => {
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.gsa.patch",
        payload: {
          meta: { sourceLayer: "L2", targetLayer: "L1", intent: "TX" },
          patchStep: { file: "contracts/src/Foo.sol", diff: "+line" },
        },
      }),
    });
    expect(r.statusCode).toBe(202);
  });

  it("blocks a patch signal where nested meta violates routing law (L2→EXTERNAL)", async () => {
    const r = await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({
        subject: "ghostbrain.gsa.patch",
        payload: {
          meta: { sourceLayer: "L2", targetLayer: "EXTERNAL", intent: "TX" },
        },
      }),
    });
    expect(r.statusCode).toBe(403);
  });

  it("updates lastSeen for a known agent on subsequent signal", async () => {
    const agentId = `update-agent-${Date.now()}`;
    // Register
    await app.inject({
      method: "POST",
      url:    "/api/v1/agents/register",
      payload: { agentId, role: "observer", capabilities: [], resourceScopes: [] },
    });

    // Send a signal from that agent
    const before = Date.now();
    await app.inject({
      method: "POST",
      url:    "/api/v1/signals",
      payload: brainMessage({ senderAgentId: agentId }),
    });

    // lastSeen should have been updated
    const agents = await app.inject({ method: "GET", url: "/api/v1/agents" });
    const found  = agents.json().agents.find((a: { agentId: string; lastSeen: string }) => a.agentId === agentId);
    expect(found).toBeDefined();
    expect(new Date(found.lastSeen).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ── POST /api/v1/agents/register ──────────────────────────────────────────────

describe("POST /api/v1/agents/register", () => {
  it("registers a new agent", async () => {
    const r = await app.inject({
      method:  "POST",
      url:     "/api/v1/agents/register",
      payload: {
        agentId:       `agent-${Date.now()}`,
        role:          "executor",
        capabilities:  ["deploy"],
        resourceScopes: [],
        healthy:       true,
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().ok).toBe(true);
  });

  it("rejects a registration missing agentId", async () => {
    const r = await app.inject({
      method:  "POST",
      url:     "/api/v1/agents/register",
      payload: { role: "observer" },
    });
    expect(r.statusCode).toBe(400);
  });
});

// ── GET /api/v1/agents ────────────────────────────────────────────────────────

describe("GET /api/v1/agents", () => {
  it("returns agent list", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/agents" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.agents)).toBe(true);
    expect(typeof body.count).toBe("number");
  });
});

// ── GET /api/v1/signals ───────────────────────────────────────────────────────

describe("GET /api/v1/signals", () => {
  it("returns recent signals", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/signals" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("supports subject filter", async () => {
    // Post a distinctly-subject signal
    await app.inject({
      method:  "POST",
      url:     "/api/v1/signals",
      payload: brainMessage({ subject: "ghostbrain.gsa.audit" }),
    });

    const r = await app.inject({
      method: "GET",
      url:    "/api/v1/signals?subject=ghostbrain.gsa.audit",
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.items.every((s: { subject: string }) => s.subject.startsWith("ghostbrain.gsa.audit"))).toBe(true);
  });

  it("supports limit query param", async () => {
    const r = await app.inject({ method: "GET", url: "/api/v1/signals?limit=5" });
    const body = r.json();
    expect(body.items.length).toBeLessThanOrEqual(5);
  });
});

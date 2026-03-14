/**
 * GhostBrain Core — GhostDNS AI Routes
 *
 * Proxies to the GhostDNS AI service (Python / FastAPI, port 18089)
 * and surfaces DNS management, anomaly intelligence, cert status, and
 * domain guardian data under the GhostBrain REST namespace.
 *
 * Prefix: /api/v1/brain/dns
 *
 * All mutating endpoints require an HMAC-signed governance header
 * (X-Ghost-Approval / X-Ghost-Nonce / X-Ghost-Timestamp) forwarded
 * from the caller — GhostBrain does NOT generate approvals.
 *
 * Env vars:
 *   GHOSTDNS_BASE_URL   — base URL of ghostdns-ai (default http://127.0.0.1:18089)
 *   GHOSTDNS_TIMEOUT_MS — per-request timeout in ms        (default 10000)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL   = (process.env.GHOSTDNS_BASE_URL   ?? "http://127.0.0.1:18089").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.GHOSTDNS_TIMEOUT_MS ?? "10000");

// ── Allowed record types (validation at the Brain boundary) ──────────────────

const ALLOWED_RTYPES = new Set(["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "CAA", "NS"]);

// ── Zod schemas ───────────────────────────────────────────────────────────────

const UpsertRecordSchema = z.object({
  fqdn:  z.string().min(3).max(253),
  type:  z.string().toUpperCase().refine(t => ALLOWED_RTYPES.has(t), { message: "unsupported record type" }),
  value: z.string().min(1).max(512),
  ttl:   z.number().int().min(30).max(86400).default(300),
});

const DeleteRecordSchema = z.object({
  fqdn: z.string().min(3).max(253),
});

const CloudflareSyncSchema = z.object({
  proxied: z.boolean().default(false),
});

// ── Low-level proxy helper ────────────────────────────────────────────────────

async function proxyGet(path: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`ghostdns-ai ${path} → ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

async function proxyPost(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`ghostdns-ai ${path} → ${resp.status}: ${detail}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Forward governance headers from the incoming request to ghostdns-ai. */
function govHeaders(req: FastifyRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of ["x-ghost-approval", "x-ghost-nonce", "x-ghost-timestamp"]) {
    const v = req.headers[h];
    if (typeof v === "string") out[h] = v;
  }
  return out;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function dnsRoutes(app: FastifyInstance): Promise<void> {

  /** GET /api/v1/brain/dns/health — ghostdns-ai service health */
  app.get("/health", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/health");
    } catch (err) {
      reply.code(503);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/zone — current zone file text */
  app.get("/zone", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/zone");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/records — list all runtime A records */
  app.get("/records", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/zone");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/records/multi — list multi-type records */
  app.get("/records/multi", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/records/multi");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /**
   * POST /api/v1/brain/dns/records/upsert
   * Upsert an A record (legacy endpoint — prefer /records/multi/upsert for other types).
   */
  app.post("/records/upsert", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = UpsertRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: parsed.error.format() };
    }
    if (parsed.data.type !== "A") {
      return proxyPost("/records/multi/upsert", parsed.data, govHeaders(req)).catch(err => {
        reply.code(502); return { ok: false, error: String(err) };
      });
    }
    return proxyPost("/records/upsert", parsed.data, govHeaders(req)).catch(err => {
      reply.code(502); return { ok: false, error: String(err) };
    });
  });

  /**
   * POST /api/v1/brain/dns/records/multi/upsert
   * Upsert any supported record type (CNAME, TXT, MX, SRV, CAA, AAAA, NS …).
   */
  app.post("/records/multi/upsert", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = UpsertRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: parsed.error.format() };
    }
    try {
      return await proxyPost("/records/multi/upsert", parsed.data, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** POST /api/v1/brain/dns/records/delete — delete a record by FQDN */
  app.post("/records/delete", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = DeleteRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: parsed.error.format() };
    }
    try {
      return await proxyPost("/records/delete", parsed.data, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** POST /api/v1/brain/dns/reconcile — trigger manual reconcile */
  app.post("/reconcile", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await proxyPost("/reconcile", {}, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** POST /api/v1/brain/dns/cloudflare/sync — sync records to Cloudflare */
  app.post("/cloudflare/sync", async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CloudflareSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: parsed.error.format() };
    }
    try {
      return await proxyPost("/cloudflare/sync", parsed.data, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  // ── AI intelligence ─────────────────────────────────────────────────────────

  /** GET /api/v1/brain/dns/intelligence/summary — AI intelligence summary */
  app.get("/intelligence/summary", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/intelligence/summary");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/intelligence/anomalies */
  app.get("/intelligence/anomalies", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/intelligence/anomalies");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/intelligence/domains */
  app.get("/intelligence/domains", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/intelligence/domains");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** GET /api/v1/brain/dns/intelligence/certs */
  app.get("/intelligence/certs", async (_req, reply: FastifyReply) => {
    try {
      return await proxyGet("/intelligence/certs");
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** POST /api/v1/brain/dns/intelligence/certs/check — trigger cert check + renewal */
  app.post("/intelligence/certs/check", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await proxyPost("/intelligence/certs/check", {}, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });

  /** POST /api/v1/brain/dns/intelligence/domains/check — trigger domain expiry check */
  app.post("/intelligence/domains/check", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await proxyPost("/intelligence/domains/check", {}, govHeaders(req));
    } catch (err) {
      reply.code(502);
      return { ok: false, error: String(err) };
    }
  });
}

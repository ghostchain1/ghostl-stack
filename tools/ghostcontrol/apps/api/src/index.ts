import { Queue } from "bullmq";
import Fastify from "fastify";
import Redis from "ioredis";
import { z } from "zod";

import { getPrismaClient } from "@ghostcontrol/db";
import {
  CreateActionRequestSchema,
  SignedActionBundleSchema,
  createLogger,
  sha256ForObject,
} from "@ghostcontrol/shared";

const logger = createLogger({ name: "ghostcontrol-api" });

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GHOSTCONTROL_TOKEN: z.string().optional(),
  L1_RPC: z.string().optional(),
  L2_RPC: z.string().optional(),
  L3_RPC: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

const prisma = getPrismaClient();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const actionRequestsQueue = new Queue("action-requests", {
  connection: redis,
});
const actionBundlesQueue = new Queue("action-bundles", {
  connection: redis,
});

function requireToken() {
  return async function preHandler(req: { url: string; headers: any }, reply: any) {
    if (req.url === "/health") return;
    if (!env.GHOSTCONTROL_TOKEN) return;
    const token = req.headers["x-ghostcontrol-token"];
    if (token !== env.GHOSTCONTROL_TOKEN) {
      reply.code(401);
      return reply.send({ ok: false, error: "unauthorized" });
    }
  };
}

async function probeRpc(url?: string): Promise<
  | { ok: true; blockNumber: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }
  | { ok: false; error: "not_configured"; latencyMs: 0 }
> {
  if (!url) return { ok: false, error: "not_configured", latencyMs: 0 };

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, error: `http_${res.status}`, latencyMs };
    const json = (await res.json()) as any;
    if (typeof json?.result !== "string") {
      return { ok: false, error: "bad_jsonrpc", latencyMs };
    }
    return { ok: true, blockNumber: json.result, latencyMs };
  } catch (e: any) {
    const latencyMs = Date.now() - started;
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "fetch_error", latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const app = Fastify({ logger: false });

  app.addHook("preHandler", requireToken());

  app.get("/health", async () => {
    const deps: Record<string, unknown> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      deps.db = "ok";
    } catch (e) {
      deps.db = "error";
    }
    try {
      await redis.ping();
      deps.redis = "ok";
    } catch (e) {
      deps.redis = "error";
    }
    return {
      ok: true,
      service: "ghostcontrol-api",
      uptimeMs: Math.floor(process.uptime() * 1000),
      deps,
    };
  });

  app.get("/status", async () => {
    const [incidentCount, actionRequestCount] = await Promise.all([
      prisma.incident.count(),
      prisma.actionRequest.count(),
    ]);

    const [l1, l2, l3] = await Promise.all([
      probeRpc(env.L1_RPC),
      probeRpc(env.L2_RPC),
      probeRpc(env.L3_RPC),
    ]);

    return {
      ok: true,
      service: "ghostcontrol-api",
      counts: {
        incidents: incidentCount,
        actionRequests: actionRequestCount,
      },
      rpc: { l1, l2, l3 },
      uptimeMs: Math.floor(process.uptime() * 1000),
    };
  });

  app.get("/incidents", async () => {
    const rows = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      source: r.source,
      severity: r.severity as any,
      signature: r.signature,
      message: r.message,
      details: (r.details as any) ?? null,
    }));
  });

  app.post("/actions/request", async (req, reply) => {
    const parsed = CreateActionRequestSchema.safeParse((req as any).body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: "invalid_body", issues: parsed.error.issues };
    }

    const created = await prisma.actionRequest.create({
      data: {
        requestedBy: parsed.data.requestedBy,
        reason: parsed.data.reason ?? null,
        riskMode: parsed.data.riskMode,
        scope: parsed.data.scope,
        requestedActions: parsed.data.requestedActions,
        status: "queued",
      },
    });

    await actionRequestsQueue.add(
      "action-request",
      { actionRequestId: created.id },
      { jobId: created.id },
    );

    await prisma.auditEvent.create({
      data: {
        actor: parsed.data.requestedBy,
        event: "action_request.queued",
        data: { actionRequestId: created.id },
      },
    });

    return {
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      requestedBy: created.requestedBy,
      reason: created.reason,
      riskMode: created.riskMode as any,
      scope: created.scope as any,
      requestedActions: created.requestedActions as any,
      status: created.status as any,
    };
  });

  app.post("/actions/submit", async (req, reply) => {
    const parsed = SignedActionBundleSchema.safeParse((req as any).body);
    if (!parsed.success) {
      reply.code(400);
      return { accepted: false, error: "invalid_body", issues: parsed.error.issues };
    }

    const b = parsed.data.bundle;
    await prisma.signedBundle.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        expiresAt: new Date(b.expiresAt),
        riskMode: b.riskMode,
        scope: b.scope,
        actions: b.actions,
        gates: b.gates,
        rollback: b.rollback,
        evidencePlan: b.evidencePlan,
        algorithm: parsed.data.algorithm,
        keyId: parsed.data.keyId,
        signatureB64: parsed.data.signatureB64,
      },
      update: {
        expiresAt: new Date(b.expiresAt),
        riskMode: b.riskMode,
        scope: b.scope,
        actions: b.actions,
        gates: b.gates,
        rollback: b.rollback,
        evidencePlan: b.evidencePlan,
        algorithm: parsed.data.algorithm,
        keyId: parsed.data.keyId,
        signatureB64: parsed.data.signatureB64,
      },
    });

    await actionBundlesQueue.add(
      "action-bundle",
      { signedBundle: parsed.data },
      { jobId: b.id },
    );

    await prisma.auditEvent.create({
      data: {
        actor: "planner",
        event: "bundle.submitted",
        data: { bundleId: b.id, signature: sha256ForObject(parsed.data.signatureB64) },
      },
    });

    return { accepted: true };
  });

  app.post("/evidence", async (req, reply) => {
    const BodySchema = z.object({
      bundleId: z.string().optional(),
      kind: z.string().min(1),
      summary: z.string().optional(),
      data: z.unknown(),
    });
    const parsed = BodySchema.safeParse((req as any).body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: "invalid_body", issues: parsed.error.issues };
    }

    await prisma.evidence.create({
      data: {
        bundleId: parsed.data.bundleId,
        kind: parsed.data.kind,
        summary: parsed.data.summary,
        data: parsed.data.data as any,
      },
    });

    return { ok: true };
  });

  app.get("/evidence", async () => {
    const rows = await prisma.evidence.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      bundleId: r.bundleId,
      kind: r.kind,
      summary: r.summary,
      data: r.data as any,
    }));
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, "api_listening");
}

main().catch((err) => {
  logger.error({ err }, "api_failed");
  process.exit(1);
});

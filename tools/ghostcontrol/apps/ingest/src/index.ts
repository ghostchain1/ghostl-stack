import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

import { getPrismaClient } from "@ghostcontrol/db";
import { createLogger, sha256ForObject } from "@ghostcontrol/shared";

const logger = createLogger({ name: "ghostcontrol-ingest" });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PROBE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  L1_RPC: z.string().optional(),
  L2_RPC: z.string().optional(),
  L3_RPC: z.string().optional(),
});
const env = EnvSchema.parse(process.env);

const prisma = getPrismaClient();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const incidentsQueue = new Queue("incidents", { connection: redis });

async function rpcProbe(url: string): Promise<
  | { ok: true; blockNumber: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }
> {
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
        method: "ghost_blockNumber",
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
    return {
      ok: false,
      error: e?.name === "AbortError" ? "timeout" : "fetch_error",
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function reportRpcFailure(params: {
  layer: "l1" | "l2" | "l3";
  url: string;
  result: { ok: false; error: string; latencyMs: number };
}) {
  const signature = sha256ForObject({
    source: "rpc_probe",
    layer: params.layer,
    error: params.result.error,
  });
  const source = `rpc_probe:${params.layer}`;
  const message = `RPC probe failed for ${params.layer}: ${params.result.error}`;

  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const existing = await prisma.incident.findFirst({
    where: { signature, createdAt: { gt: oneMinuteAgo } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    logger.debug({ layer: params.layer, signature }, "rpc_failure_deduped");
    return;
  }

  const incident = await prisma.incident.create({
    data: {
      source,
      severity: "error",
      signature,
      message,
      details: {
        layer: params.layer,
        url: params.url,
        ...params.result,
      },
    },
  });

  await incidentsQueue.add(
    "incident",
    { incidentId: incident.id },
    { jobId: incident.id },
  );

  await prisma.auditEvent.create({
    data: {
      actor: "ingest",
      event: "incident.created",
      data: { incidentId: incident.id, signature },
    },
  });

  logger.warn({ layer: params.layer, incidentId: incident.id }, "rpc_probe_incident_created");
}

async function runOnce() {
  const targets = [
    { layer: "l1" as const, url: env.L1_RPC },
    { layer: "l2" as const, url: env.L2_RPC },
    { layer: "l3" as const, url: env.L3_RPC },
  ];

  for (const t of targets) {
    if (!t.url) continue;
    const result = await rpcProbe(t.url);
    if (!result.ok) await reportRpcFailure({ layer: t.layer, url: t.url, result });
  }
}

async function main() {
  logger.info({ intervalMs: env.PROBE_INTERVAL_MS }, "ingest_started");
  await runOnce();
  setInterval(runOnce, env.PROBE_INTERVAL_MS).unref();
}

main().catch((err) => {
  logger.error({ err }, "ingest_failed");
  process.exit(1);
});

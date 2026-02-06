import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

import { Worker } from "bullmq";
import Redis from "ioredis";
import { z } from "zod";

import { getPrismaClient } from "@ghostcontrol/db";
import {
  ActionScopeSchema,
  ProposedActionSchema,
  RiskModeSchema,
  createLogger,
  signActionBundle,
} from "@ghostcontrol/shared";

const logger = createLogger({ name: "ghostcontrol-planner" });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_URL: z.string().min(1),
  POLICY_URL: z.string().min(1),
  SIGNING_PRIVATE_KEY_PATH: z.string().min(1),
  SIGNING_KEY_ID: z.string().min(1).default("dev"),
  GHOSTCONTROL_TOKEN: z.string().optional(),
});
const env = EnvSchema.parse(process.env);

const prisma = getPrismaClient();
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const EvaluateResponseSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()).optional(),
});

async function policyAllows(params: {
  riskMode: z.infer<typeof RiskModeSchema>;
  scope: z.infer<typeof ActionScopeSchema>;
  actions: z.infer<typeof ProposedActionSchema>[];
  gates: any[];
}): Promise<{ allowed: true } | { allowed: false; reasons: string[] }> {
  const res = await fetch(`${env.POLICY_URL.replace(/\\/+$/, "")}/policy/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) return { allowed: false, reasons: ["policy_http_error"] };
  const json = EvaluateResponseSchema.safeParse(await res.json());
  if (!json.success) return { allowed: false, reasons: ["policy_bad_response"] };
  return json.data.allowed
    ? { allowed: true }
    : { allowed: false, reasons: json.data.reasons ?? ["policy_denied"] };
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.GHOSTCONTROL_TOKEN) headers["x-ghostcontrol-token"] = env.GHOSTCONTROL_TOKEN;
  return headers;
}

async function submitSignedBundle(signedBundle: any): Promise<boolean> {
  const res = await fetch(`${env.API_URL.replace(/\\/+$/, "")}/actions/submit`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(signedBundle),
  });
  return res.ok;
}

async function main() {
  const privateKeyPem = await readFile(env.SIGNING_PRIVATE_KEY_PATH, "utf8");

  const incidentsWorker = new Worker(
    "incidents",
    async (job) => {
      const incidentId = String((job.data as any)?.incidentId ?? "");
      if (!incidentId) {
        logger.warn({ jobId: job.id }, "incident_job_missing_id");
        return;
      }

      const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
      if (!incident) {
        logger.warn({ incidentId }, "incident_not_found");
        return;
      }

      const actions = [
        {
          kind: "health.rpc_probe",
          params: { hint: "reprobe", source: incident.source },
        },
      ] as const;

      const scope = {
        workspaceRoot: "/workspace",
        services: [],
      };

      const riskMode = "SAFE" as const;

      const allowed = await policyAllows({
        riskMode,
        scope,
        actions: actions as any,
        gates: [],
      });
      if (!allowed.allowed) {
        logger.info({ incidentId, reasons: allowed.reasons }, "policy_denied_incident_bundle");
        return;
      }

      const now = new Date();
      const bundle = {
        id: crypto.randomUUID(),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        riskMode,
        scope,
        actions: actions as any,
        gates: [],
        rollback: { strategy: "none" as const },
        evidencePlan: { writeEvidenceJson: true },
      };

      const signed = signActionBundle({
        bundle: bundle as any,
        keyId: env.SIGNING_KEY_ID,
        privateKeyPem,
      });

      const ok = await submitSignedBundle(signed);
      logger.info({ incidentId, bundleId: bundle.id, ok }, "incident_bundle_submitted");
    },
    { connection: redis },
  );

  const actionRequestsWorker = new Worker(
    "action-requests",
    async (job) => {
      const actionRequestId = String((job.data as any)?.actionRequestId ?? "");
      if (!actionRequestId) {
        logger.warn({ jobId: job.id }, "action_request_job_missing_id");
        return;
      }

      const request = await prisma.actionRequest.findUnique({ where: { id: actionRequestId } });
      if (!request) {
        logger.warn({ actionRequestId }, "action_request_not_found");
        return;
      }

      const scope = ActionScopeSchema.parse(request.scope);
      const riskMode = RiskModeSchema.parse(request.riskMode);
      const actions = z.array(ProposedActionSchema).parse(request.requestedActions);

      const allowed = await policyAllows({
        riskMode,
        scope,
        actions,
        gates: [],
      });
      if (!allowed.allowed) {
        logger.info(
          { actionRequestId, reasons: allowed.reasons },
          "policy_denied_action_request_bundle",
        );
        await prisma.auditEvent.create({
          data: {
            actor: "planner",
            event: "bundle.denied",
            data: { actionRequestId, reasons: allowed.reasons },
          },
        });
        return;
      }

      const now = new Date();
      const bundle = {
        id: actionRequestId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        riskMode,
        scope,
        actions,
        gates: [],
        rollback: { strategy: "none" as const },
        evidencePlan: { writeEvidenceJson: true },
      };

      const signed = signActionBundle({
        bundle: bundle as any,
        keyId: env.SIGNING_KEY_ID,
        privateKeyPem,
      });

      const ok = await submitSignedBundle(signed);
      logger.info({ actionRequestId, bundleId: bundle.id, ok }, "action_request_bundle_submitted");
    },
    { connection: redis },
  );

  logger.info("planner_started");

  const shutdown = async () => {
    logger.info("planner_stopping");
    await Promise.all([incidentsWorker.close(), actionRequestsWorker.close(), redis.quit()]);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "planner_failed");
  process.exit(1);
});


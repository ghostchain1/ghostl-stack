import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { Worker } from "bullmq";
import Docker from "dockerode";
import { Redis } from "ioredis";
import { z } from "zod";

import {
  CommandGateSchema,
  SignedActionBundleSchema,
  createLogger,
  sha256ForObject,
  verifyActionBundle,
} from "@ghostcontrol/shared";

const logger = createLogger({ name: "ghostcontrol-runner" });

const EnvSchema = z.object({
  API_URL: z.string().min(1),
  POLICY_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DOCKER_HOST: z.string().default("tcp://docker-socket-proxy:2375"),
  WORKSPACE: z.string().default("/workspace"),
  EVIDENCE_DIR: z.string().default("/evidence"),
  RUNNER_MODE: z.enum(["SAFE", "GATED"]).default("SAFE"),
  SIGNING_PUBLIC_KEY_PATH: z.string().min(1),
  SIGNING_KEY_ID: z.string().min(1).default("dev"),
  GHOSTCONTROL_TOKEN: z.string().optional(),
  L1_RPC: z.string().optional(),
  L2_RPC: z.string().optional(),
  L3_RPC: z.string().optional(),
});
const env = EnvSchema.parse(process.env);

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const EvaluateResponseSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()).optional(),
});

function parseDockerHost(dockerHost: string): { host: string; port: number } {
  const m = dockerHost.match(/^tcp:\/\/([^:]+):(\d+)$/);
  if (!m) return { host: "docker-socket-proxy", port: 2375 };
  return { host: m[1], port: Number(m[2]) };
}

const dockerTarget = parseDockerHost(env.DOCKER_HOST);
const docker = new Docker({ host: dockerTarget.host, port: dockerTarget.port, protocol: "http" });

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.GHOSTCONTROL_TOKEN) headers["x-ghostcontrol-token"] = env.GHOSTCONTROL_TOKEN;
  return headers;
}

async function policyAllows(bundle: any): Promise<{ allowed: true } | { allowed: false; reasons: string[] }> {
  const res = await fetch(`${env.POLICY_URL.replace(/\/+$/, "")}/policy/evaluate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      riskMode: bundle.riskMode,
      scope: bundle.scope,
      actions: bundle.actions,
      gates: bundle.gates ?? [],
    }),
  });
  if (!res.ok) return { allowed: false, reasons: ["policy_http_error"] };
  const json = EvaluateResponseSchema.safeParse(await res.json());
  if (!json.success) return { allowed: false, reasons: ["policy_bad_response"] };
  return json.data.allowed
    ? { allowed: true }
    : { allowed: false, reasons: json.data.reasons ?? ["policy_denied"] };
}

async function postEvidence(payload: unknown) {
  const res = await fetch(`${env.API_URL.replace(/\/+$/, "")}/evidence`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`evidence_http_${res.status}`);
}

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

async function restartComposeService(params: { service: string; project?: string }) {
  const labels = [`com.docker.compose.service=${params.service}`];
  if (params.project) labels.push(`com.docker.compose.project=${params.project}`);
  const containers = await docker.listContainers({
    all: true,
    filters: { label: labels } as any,
  });
  if (containers.length === 0) throw new Error("no_containers_for_service");
  for (const c of containers) await docker.getContainer(c.Id).restart();
  return { restarted: containers.length };
}

async function restartContainerByName(name: string) {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [name] } as any,
  });
  if (containers.length === 0) throw new Error("container_not_found");
  for (const c of containers) await docker.getContainer(c.Id).restart();
  return { restarted: containers.length };
}

async function runCommandGate(gate: z.infer<typeof CommandGateSchema>) {
  if (env.RUNNER_MODE === "SAFE" || gate.dryRun) {
    return { ok: true, dryRun: true, command: gate.command };
  }

  const started = Date.now();
  const [cmd, ...args] = gate.command;
  const child = spawn(cmd, args, {
    cwd: gate.cwd ?? env.WORKSPACE,
    env: { ...process.env, ...(gate.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => (stdout += String(d)));
  child.stderr?.on("data", (d) => (stderr += String(d)));

  const timeoutMs = gate.timeoutMs ?? 10 * 60 * 1000;
  const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);

  return {
    ok: exitCode === 0,
    dryRun: false,
    exitCode,
    durationMs: Date.now() - started,
    stdout: stdout.slice(-16_000),
    stderr: stderr.slice(-16_000),
  };
}

function effectiveUrlForLayer(layer: string): string | undefined {
  if (layer === "l1") return env.L1_RPC;
  if (layer === "l2") return env.L2_RPC;
  if (layer === "l3") return env.L3_RPC;
  return undefined;
}

async function main() {
  const publicKeyPem = await readFile(env.SIGNING_PUBLIC_KEY_PATH, "utf8");
  await mkdir(env.EVIDENCE_DIR, { recursive: true });

  const worker = new Worker(
    "action-bundles",
    async (job) => {
      const parsed = SignedActionBundleSchema.safeParse((job.data as any)?.signedBundle);
      if (!parsed.success) {
        logger.warn({ jobId: job.id }, "bundle_job_invalid");
        return;
      }
      const signed = parsed.data;
      const bundle = signed.bundle;

      if (env.RUNNER_MODE === "SAFE" && bundle.riskMode !== "SAFE") {
        logger.warn({ bundleId: bundle.id, riskMode: bundle.riskMode }, "runner_mode_blocks_risk");
        return;
      }

      const verification = verifyActionBundle({ signed, publicKeyPem });
      if (!verification.ok) {
        logger.warn({ bundleId: bundle.id, reason: verification.reason }, "bundle_signature_invalid");
        return;
      }

      if (new Date(bundle.expiresAt).getTime() < Date.now()) {
        logger.warn({ bundleId: bundle.id }, "bundle_expired");
        return;
      }

      const policy = await policyAllows(bundle);
      if (!policy.allowed) {
        logger.warn({ bundleId: bundle.id, reasons: policy.reasons }, "policy_denied_bundle");
        return;
      }

      const gateResults: any[] = [];
      for (const gate of bundle.gates ?? []) {
        const result = await runCommandGate(CommandGateSchema.parse(gate));
        gateResults.push({ name: gate.name, ...result });
        if (!result.ok) {
          await postEvidence({
            bundleId: bundle.id,
            kind: "bundle.failed.gate",
            summary: `Gate failed: ${gate.name}`,
            data: { gate: gate.name, result },
          });
          throw new Error(`gate_failed:${gate.name}`);
        }
      }

      const actionResults: any[] = [];
      for (const action of bundle.actions) {
        if (action.kind === "docker.restart_service") {
          const service = String((action.params as any)?.service ?? "");
          const project = (action.params as any)?.project;
          const result = await restartComposeService({
            service,
            project: project ? String(project) : undefined,
          });
          actionResults.push({ kind: action.kind, service, result });
          continue;
        }
        if (action.kind === "docker.restart_container") {
          const container = String((action.params as any)?.container ?? "");
          const result = await restartContainerByName(container);
          actionResults.push({ kind: action.kind, container, result });
          continue;
        }
        if (action.kind === "health.rpc_probe") {
          const explicitUrl = (action.params as any)?.url;
          const layer = (action.params as any)?.layer;
          const url = explicitUrl ? String(explicitUrl) : layer ? effectiveUrlForLayer(String(layer)) : undefined;
          if (!url) throw new Error("rpc_probe_missing_url");
          const result = await rpcProbe(url);
          actionResults.push({ kind: action.kind, url, result });
          continue;
        }
        actionResults.push({ kind: action.kind, skipped: true, reason: "unsupported_action" });
      }

      const evidence = {
        bundleId: bundle.id,
        ranAt: new Date().toISOString(),
        gates: gateResults,
        actions: actionResults,
      };
      const evidencePath = path.join(env.EVIDENCE_DIR, `${bundle.id}-${Date.now()}.json`);
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

      await postEvidence({
        bundleId: bundle.id,
        kind: "bundle.completed",
        summary: "Bundle executed",
        data: { evidencePath, evidenceHash: sha256ForObject(evidence) },
      });

      logger.info({ bundleId: bundle.id, evidencePath }, "bundle_executed");
    },
    { connection: redis },
  );

  logger.info("runner_started");

  const shutdown = async () => {
    logger.info("runner_stopping");
    await Promise.all([worker.close(), redis.quit()]);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "runner_failed");
  process.exit(1);
});

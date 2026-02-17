import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import Fastify from "fastify";
import { z } from "zod";

import {
  ActionBundleSchema,
  ActionScopeSchema,
  CommandGateSchema,
  ProposedActionSchema,
  RiskModeSchema,
  createLogger,
} from "@ghostcontrol/shared";

const logger = createLogger({ name: "ghostcontrol-policy" });
const localRequire = createRequire(import.meta.url);
type PolicyEval = (input: {
  content: string;
  source?: string;
  contextTags?: string[];
}) => { ok: boolean; violations: Array<{ reason: string; line: number; column: number }> };

let evaluateGstPolicy: PolicyEval = () => ({ ok: true, violations: [] });
let gstPolicyLoaded = false;
const gstPolicyCandidates = [
  "/app/apps/policy/gst_policy.cjs",
  "/app/services/ai-policy/gst_policy.cjs",
  path.resolve(process.cwd(), "apps/policy/gst_policy.cjs"),
  path.resolve(process.cwd(), "services/ai-policy/gst_policy.cjs"),
  path.resolve(process.cwd(), "../../services/ai-policy/gst_policy.cjs"),
  path.resolve(process.cwd(), "../../../services/ai-policy/gst_policy.cjs"),
];

for (const candidate of gstPolicyCandidates) {
  if (!existsSync(candidate)) continue;
  try {
    const loaded = localRequire(candidate) as { evaluateGstPolicy?: PolicyEval };
    if (typeof loaded.evaluateGstPolicy === "function") {
      evaluateGstPolicy = loaded.evaluateGstPolicy;
      gstPolicyLoaded = true;
      break;
    }
  } catch (error) {
    logger.warn({ err: error, candidate }, "gst_policy_module_load_failed");
  }
}

if (!gstPolicyLoaded) {
  logger.warn({ candidates: gstPolicyCandidates }, "gst_policy_module_unavailable");
}

const evaluatePolicy: PolicyEval = (input: {
    content: string;
    source?: string;
    contextTags?: string[];
  }) => evaluateGstPolicy(input);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8082),
  RISK_ALLOWLIST_PATH: z.string().min(1),
  ACTION_SCOPES_PATH: z.string().min(1),
});
const env = EnvSchema.parse(process.env);

const RiskTier: Record<string, number> = {
  SAFE: 0,
  GATED: 1,
  APPROVAL: 2,
  GOVERNANCE: 3,
};

const AllowlistSchema = z.record(
  RiskModeSchema,
  z.object({
    actions: z.array(z.string().min(1)).default([]),
    gateCommandPrefixes: z
      .array(z.array(z.string().min(1)).min(1))
      .default([]),
  }),
);

const ScopesSchema = z.object({
  workspaceRootAllowPrefixes: z.array(z.string().min(1)).default(["/workspace"]),
  dockerServiceAllowlist: z.array(z.string().min(1)).default([]),
});

const EvaluateSchema = z.object({
  riskMode: RiskModeSchema,
  scope: ActionScopeSchema,
  actions: z.array(ProposedActionSchema),
  gates: z.array(CommandGateSchema).default([]),
});

function commandMatchesPrefix(command: string[], prefixes: string[][]): boolean {
  for (const prefix of prefixes) {
    if (command.length < prefix.length) continue;
    let matches = true;
    for (let i = 0; i < prefix.length; i++) {
      if (command[i] !== prefix[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

async function main() {
  const allowlistRaw = JSON.parse(
    await readFile(env.RISK_ALLOWLIST_PATH, "utf8"),
  );
  const scopesRaw = JSON.parse(await readFile(env.ACTION_SCOPES_PATH, "utf8"));
  const allowlist = AllowlistSchema.parse(allowlistRaw);
  const scopes = ScopesSchema.parse(scopesRaw);

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    service: "ghostcontrol-policy",
    uptimeMs: Math.floor(process.uptime() * 1000),
  }));

  app.post("/policy/evaluate", async (req, reply) => {
    const parsed = EvaluateSchema.safeParse((req as any).body);
    if (!parsed.success) {
      reply.code(400);
      return { allowed: false, error: "invalid_body", issues: parsed.error.issues };
    }

    const mode = parsed.data.riskMode;
    const tier = RiskTier[mode] ?? 99;
    const cfg = allowlist[mode] ?? {
      actions: [],
      gateCommandPrefixes: [],
    };
    const reasons: string[] = [];
    if (!allowlist[mode]) reasons.push(`risk_mode_not_configured:${mode}`);

    const aiPolicyPayload = JSON.stringify({
      riskMode: parsed.data.riskMode,
      scope: parsed.data.scope,
      actions: parsed.data.actions,
      gates: parsed.data.gates
    });
    const aiPolicyCheck = evaluatePolicy({
      content: aiPolicyPayload,
      source: "ghostcontrol.policy.evaluate",
      contextTags: ["ai_patch", "pr_diff"]
    });
    if (!aiPolicyCheck.ok) {
      for (const v of aiPolicyCheck.violations.slice(0, 5)) {
        reasons.push(`gst_policy_violation:${v.reason}:${v.line}:${v.column}`);
      }
    }

    const allowedWorkspace = scopes.workspaceRootAllowPrefixes.some((p) =>
      parsed.data.scope.workspaceRoot.startsWith(p),
    );
    if (!allowedWorkspace) reasons.push("scope.workspace_root_not_allowed");

    for (const action of parsed.data.actions) {
      if (!cfg.actions.includes(action.kind)) {
        reasons.push(`action.kind_not_allowlisted:${action.kind}`);
        continue;
      }
      if (action.kind === "docker.restart_service") {
        const service = String((action.params as any)?.service ?? "");
        if (!service) {
          reasons.push("docker.restart_service.missing_service");
        } else if (
          scopes.dockerServiceAllowlist.length > 0 &&
          !scopes.dockerServiceAllowlist.includes(service)
        ) {
          reasons.push(`docker.restart_service.service_not_allowed:${service}`);
        }
      }
    }

    for (const gate of parsed.data.gates) {
      if (!commandMatchesPrefix(gate.command, cfg.gateCommandPrefixes)) {
        reasons.push(`gate.command_not_allowlisted:${gate.name}`);
      }
    }

    const allowed = reasons.length === 0;
    return {
      allowed,
      riskMode: mode,
      riskTier: tier,
      requiredApprovals: allowed ? [] : ["policy_fix_required"],
      constraints: {
        scopes,
      },
      reasons,
    };
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, "policy_listening");
}

main().catch((err) => {
  logger.error({ err }, "policy_failed");
  process.exit(1);
});

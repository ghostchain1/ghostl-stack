import { readFile } from "node:fs/promises";

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
    const cfg = allowlist[mode];
    const reasons: string[] = [];

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


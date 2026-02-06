import { z } from "zod";

export const RiskModeSchema = z.enum([
  "SAFE",
  "GATED",
  "APPROVAL",
  "GOVERNANCE",
]);

export const LayerSchema = z.enum(["l1", "l2", "l3"]);

export const ActionKindSchema = z.enum([
  "docker.restart_service",
  "docker.restart_container",
  "health.rpc_probe",
  "gates.run_commands",
]);

export const ActionScopeSchema = z.object({
  workspaceRoot: z.string().min(1),
  layers: z.array(LayerSchema).optional(),
  services: z.array(z.string().min(1)).optional(),
});

export const ProposedActionSchema = z.object({
  kind: ActionKindSchema,
  params: z.record(z.unknown()),
});

export const CommandGateSchema = z.object({
  kind: z.literal("command"),
  name: z.string().min(1),
  command: z.array(z.string().min(1)).min(1),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  dryRun: z.boolean().optional(),
});

export const ActionBundleSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  riskMode: RiskModeSchema,
  scope: ActionScopeSchema,
  actions: z.array(ProposedActionSchema),
  gates: z.array(CommandGateSchema),
  rollback: z.object({
    strategy: z.enum(["git_revert", "none"]),
    ref: z.string().optional(),
  }),
  evidencePlan: z.object({
    writeEvidenceJson: z.boolean(),
  }),
});

export const SignedActionBundleSchema = z.object({
  algorithm: z.literal("ed25519"),
  keyId: z.string().min(1),
  bundle: ActionBundleSchema,
  signatureB64: z.string().min(1),
});

export const CreateActionRequestSchema = z.object({
  requestedBy: z.string().min(1).default("manual"),
  reason: z.string().optional(),
  riskMode: RiskModeSchema.default("SAFE"),
  scope: ActionScopeSchema,
  requestedActions: z.array(ProposedActionSchema).min(1),
});


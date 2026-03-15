/**
 * taskTranslator.ts
 *
 * Stage 3 of the Copilot pipeline.
 * Maps a classified intent + extracted entities into a concrete
 * OrchestratorTask ready to be validated and executed.
 */

import type { ClassifiedIntent } from "./intentClassifier.js";
import type { CommandEntities } from "./commandInterpreter.js";

// ── Task types ────────────────────────────────────────────────────────────────

/** A command task is forwarded to the Universal Orchestrator. */
export interface CommandTask {
  type:      "command";
  target:    string;
  action:    string;
  params?:   Record<string, unknown>;
  priority:  string;
}

/** A query task fetches read-only data from GhostBrain services. */
export interface QueryTask {
  type:      "query";
  queryType: string;
  fetchUrls: string[];
}

export type OrchestratorTask = CommandTask | QueryTask;

// ── Service URL constants (server-side) ───────────────────────────────────────

const KERNEL_URL   = () => process.env["KERNEL_URL"]   ?? "http://localhost:9300";
const EIE_URL      = () => process.env["EIE_URL"]      ?? "http://localhost:9800";
const VF_URL       = () => process.env["VF_URL"]       ?? "http://localhost:9700";
const UO_URL       = () => process.env["UO_URL"]       ?? "http://localhost:9990";
const GOVERNANCE_URL = () => process.env["GOVERNANCE_URL"] ?? "http://localhost:9400";
const TDS_URL      = () => process.env["TDS_URL"]      ?? "http://localhost:9960";

// ── Translation map ───────────────────────────────────────────────────────────

type CommandSpec = {
  target: string;
  action: string;
  priority?: string;
};

const ACTION_MAP: Record<string, (entities: CommandEntities) => CommandSpec> = {
  // Validators
  deploy_validator:    (e) => ({ target: "validator-fabric", action: "deploy",         priority: "normal" }),
  remove_validator:    (e) => ({ target: "validator-fabric", action: "remove",         priority: "high"   }),
  migrate_validator:   (e) => ({ target: "validator-fabric", action: "migrate",        priority: "high"   }),
  // RPC / infra
  scale_rpc:           (e) => ({ target: "aim",              action: "scale",          priority: "normal" }),
  restart_node:        (e) => ({ target: "aim",              action: "restart",        priority: "high"   }),
  pause_service:       (e) => ({ target: e.service ?? "kernel", action: "pause",      priority: "high"   }),
  resume_service:      (e) => ({ target: e.service ?? "kernel", action: "resume",     priority: "normal" }),
  // Security
  security_scan:       (e) => ({ target: "tds",              action: "scan",           priority: "high"   }),
  threat_response:     (e) => ({ target: "tds",              action: "respond",        priority: "high"   }),
  firewall_update:     (e) => ({ target: "tds",              action: "update-firewall",priority: "high"   }),
  // Economy
  optimize_gas:        (e) => ({ target: "economic",         action: "optimize-gas",   priority: "normal" }),
  rebalance_liquidity: (e) => ({ target: "economic",         action: "rebalance",      priority: "normal" }),
  optimize_tokenomics: (e) => ({ target: "economic",         action: "optimize-tokenomics", priority: "normal" }),
  run_simulation:      (e) => ({ target: "economic",         action: "run-simulation", priority: "low"    }),
  // Governance
  sync_governance:     (e) => ({ target: "governance",       action: "sync",           priority: "normal" }),
  governance_vote:     (e) => ({ target: "governance",       action: "vote",           priority: "normal" }),
  execute_proposal:    (e) => ({ target: "governance",       action: "execute",        priority: "high"   }),
  // AI / evolution
  evolve_agents:       (e) => ({ target: "evolution",        action: "evolve",         priority: "normal" }),
  flush_telemetry:     (e) => ({ target: "data-mesh",        action: "flush",          priority: "normal" }),
  sync_peers:          (e) => ({ target: "gin",              action: "sync-peers",     priority: "normal" }),
  // Compliance
  compliance_audit:    (e) => ({ target: "acge",             action: "audit",          priority: "normal" }),
  // Blockchain
  deploy_contract:     (e) => ({ target: "multichain",       action: "deploy-contract",priority: "normal" }),
  sync_chain:          (e) => ({ target: "multichain",       action: "sync",           priority: "normal" }),
  // System
  health_check:        (e) => ({ target: "kernel",           action: "health",         priority: "low"    }),
  emergency_shutdown:  (e) => ({ target: "kernel",           action: "emergency-shutdown", priority: "emergency" }),
};

// ── Query fetch-URL map ───────────────────────────────────────────────────────

const QUERY_URLS: Record<string, () => string[]> = {
  query_validators: () => [`${VF_URL()}/validators`],
  query_treasury:   () => [`${EIE_URL()}/treasury`],
  query_node_load:  () => [`${UO_URL()}/systems`],
  query_health:     () => [`${UO_URL()}/systems`, `${KERNEL_URL()}/health`],
  query_tasks:      () => [`${KERNEL_URL()}/tasks`],
  query_alerts:     () => [`${UO_URL()}/alerts`],
  query_chain:      () => [`${UO_URL()}/status`],
  query_liquidity:  () => [`${EIE_URL()}/liquidity`],
  query_compliance: () => [`${UO_URL()}/status`],
};

// ── Translator ────────────────────────────────────────────────────────────────

export function translate(cls: ClassifiedIntent, entities: CommandEntities): OrchestratorTask {
  if (cls.isQuery || cls.intent.startsWith("query_")) {
    return {
      type:      "query",
      queryType: cls.intent,
      fetchUrls: QUERY_URLS[cls.intent]?.() ?? [`${UO_URL()}/status`],
    };
  }

  const specFn = ACTION_MAP[cls.intent];
  if (!specFn) {
    // Unknown intent — default health check
    return { type: "command", target: "kernel", action: "health", priority: "low" };
  }

  const spec = specFn(entities);
  const params: Record<string, unknown> = {};
  if (entities.region)  params["region"] = entities.region;
  if (entities.count !== undefined) params["count"] = entities.count;
  if (entities.layer)   params["layer"]  = entities.layer;
  if (entities.target)  params["target"] = entities.target;

  const task: CommandTask = {
    type:    "command",
    target:  spec.target,
    action:  spec.action,
    priority: cls.priority || spec.priority || "normal",
  };
  if (Object.keys(params).length > 0) {
    task.params = params;
  }
  return task;
}

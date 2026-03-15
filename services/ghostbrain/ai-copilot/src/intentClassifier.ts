/**
 * intentClassifier.ts
 *
 * Stage 2 of the Copilot pipeline.
 * Classifies a normalised command string into a structured intent,
 * covering all GhostBrain subsystems.
 */

import type { ParsedCommand } from "./commandInterpreter.js";

// ── Intent types ──────────────────────────────────────────────────────────────

export type ActionIntent =
  // Validators
  | "deploy_validator"
  | "remove_validator"
  | "migrate_validator"
  // Infrastructure / RPC
  | "scale_rpc"
  | "restart_node"
  | "pause_service"
  | "resume_service"
  // Security
  | "security_scan"
  | "threat_response"
  | "firewall_update"
  // Economy
  | "optimize_gas"
  | "rebalance_liquidity"
  | "optimize_tokenomics"
  | "run_simulation"
  // Governance
  | "sync_governance"
  | "governance_vote"
  | "execute_proposal"
  // AI / Evolution
  | "evolve_agents"
  | "flush_telemetry"
  | "sync_peers"
  // Compliance
  | "compliance_audit"
  // Blockchain
  | "deploy_contract"
  | "sync_chain"
  // Orchestrator
  | "health_check"
  | "emergency_shutdown";

export type QueryIntent =
  | "query_validators"
  | "query_treasury"
  | "query_node_load"
  | "query_health"
  | "query_tasks"
  | "query_alerts"
  | "query_chain"
  | "query_liquidity"
  | "query_compliance";

export type Intent = ActionIntent | QueryIntent | "unknown";

export interface ClassifiedIntent {
  intent:     Intent;
  confidence: "high" | "medium" | "low";
  isQuery:    boolean;
  priority:   "emergency" | "high" | "normal" | "low";
}

// ── Rule engine ───────────────────────────────────────────────────────────────

interface ActionRule {
  keywords:  string[];           // ALL must match (AND)
  any?:      string[];           // OR — at least one must match
  intent:    ActionIntent;
  priority?: ClassifiedIntent["priority"];
}

interface QueryRule {
  keywords:  string[];
  any?:      string[];
  intent:    QueryIntent;
}

const ACTION_RULES: ActionRule[] = [
  // validators
  { keywords: ["deploy"],              any: ["validator", "validators"],        intent: "deploy_validator"    },
  { keywords: ["add"],                 any: ["validator"],                      intent: "deploy_validator"    },
  { keywords: ["remove", "validator"],                                          intent: "remove_validator"    },
  { keywords: ["migrate", "validator"],                                         intent: "migrate_validator"   },
  // rpc / infra
  { keywords: ["scale"],               any: ["rpc", "node", "nodes"],           intent: "scale_rpc"           },
  { keywords: ["restart"],             any: ["node", "rpc", "service"],         intent: "restart_node"        },
  { keywords: ["pause"],               any: ["service", "node"],                intent: "pause_service"       },
  { keywords: ["resume", "start"],     any: ["service", "node"],                intent: "resume_service"      },
  // security
  { keywords: ["scan"],                any: ["security", "network", "system"],  intent: "security_scan"       },
  { keywords: ["vulnerability"],                                                 intent: "security_scan"       },
  { keywords: ["threat", "response"],                                           intent: "threat_response",    priority: "high"      },
  { keywords: ["firewall"],            any: ["update", "reload", "flush"],      intent: "firewall_update",    priority: "high"      },
  // economy
  { keywords: ["optimize"],            any: ["gas", "fees"],                    intent: "optimize_gas"        },
  { keywords: ["rebalance"],           any: ["liquidity", "pool"],              intent: "rebalance_liquidity" },
  { keywords: ["optimize"],            any: ["tokenomics", "token"],            intent: "optimize_tokenomics" },
  { keywords: ["simulation", "run"],                                            intent: "run_simulation"      },
  { keywords: ["simulate"],                                                     intent: "run_simulation"      },
  // governance
  { keywords: ["sync", "governance"],                                           intent: "sync_governance"     },
  { keywords: ["vote"],                any: ["governance", "proposal"],         intent: "governance_vote"     },
  { keywords: ["execute", "proposal"],                                          intent: "execute_proposal"    },
  // AI / evolution
  { keywords: ["evolve"],              any: ["agent", "agents"],               intent: "evolve_agents"       },
  { keywords: ["flush"],               any: ["telemetry", "data"],             intent: "flush_telemetry"     },
  { keywords: ["sync"],                any: ["peer", "peers"],                 intent: "sync_peers"          },
  // compliance
  { keywords: ["compliance"],          any: ["scan", "audit", "check"],        intent: "compliance_audit"    },
  { keywords: ["audit"],                                                        intent: "compliance_audit"    },
  // blockchain
  { keywords: ["deploy"],              any: ["contract", "smart"],             intent: "deploy_contract"     },
  { keywords: ["sync"],                any: ["chain", "blockchain"],           intent: "sync_chain"          },
  // system
  { keywords: ["health"],                                                       intent: "health_check"        },
  { keywords: ["emergency"],           any: ["shutdown", "halt", "stop"],      intent: "emergency_shutdown", priority: "emergency" },
];

const QUERY_RULES: QueryRule[] = [
  { keywords: ["validator"],   any: ["how many", "how much", "count", "active", "list", "status"],  intent: "query_validators" },
  { keywords: ["treasury"],    any: ["balance", "amount", "how much", "what is"],                   intent: "query_treasury"   },
  { keywords: ["liquidity"],   any: ["pool", "balance", "available"],                               intent: "query_liquidity"  },
  { keywords: ["cpu", "load"], any: ["node", "which", "high"],                                      intent: "query_node_load"  },
  { keywords: ["health"],      any: ["system", "show", "status"],                                   intent: "query_health"     },
  { keywords: ["task"],        any: ["active", "running", "queued"],                                intent: "query_tasks"      },
  { keywords: ["alert"],       any: ["critical", "warning"],                                        intent: "query_alerts"     },
  { keywords: ["chain"],       any: ["status", "block", "height", "tps"],                           intent: "query_chain"      },
  { keywords: ["compliance"],                                                                        intent: "query_compliance" },
];

function matches(normalized: string, rule: { keywords: string[]; any?: string[] }): boolean {
  const allMatch = rule.keywords.every((k) => normalized.includes(k));
  if (!allMatch) return false;
  if (rule.any && rule.any.length > 0) {
    return rule.any.some((k) => normalized.includes(k));
  }
  return true;
}

// ── Classifier ────────────────────────────────────────────────────────────────

export function classify(parsed: ParsedCommand): ClassifiedIntent {
  const { normalized, isQuery } = parsed;

  // Query path — check query rules first when query signal detected
  if (isQuery) {
    for (const rule of QUERY_RULES) {
      if (matches(normalized, rule)) {
        return { intent: rule.intent, confidence: "high", isQuery: true, priority: "low" };
      }
    }
    // Also try a broad fallback for queries
    if (normalized.includes("validator"))  return { intent: "query_validators", confidence: "medium", isQuery: true, priority: "low" };
    if (normalized.includes("treasury"))   return { intent: "query_treasury", confidence: "medium", isQuery: true, priority: "low" };
    if (normalized.includes("health"))     return { intent: "query_health", confidence: "medium", isQuery: true, priority: "low" };
  }

  // Action path — match action rules in order (most specific first due to array order)
  for (const rule of ACTION_RULES) {
    if (matches(normalized, rule)) {
      return {
        intent:     rule.intent,
        confidence: "high",
        isQuery:    false,
        priority:   rule.priority ?? "normal",
      };
    }
  }

  // Keyword fallbacks for partial matches
  if (normalized.includes("validator"))  return { intent: "deploy_validator",  confidence: "low", isQuery, priority: "normal" };
  if (normalized.includes("rpc"))        return { intent: "scale_rpc",         confidence: "low", isQuery, priority: "normal" };
  if (normalized.includes("security"))   return { intent: "security_scan",     confidence: "low", isQuery, priority: "normal" };
  if (normalized.includes("gas"))        return { intent: "optimize_gas",      confidence: "low", isQuery, priority: "normal" };
  if (normalized.includes("health"))     return { intent: "health_check",      confidence: "low", isQuery, priority: "normal" };

  return { intent: "unknown", confidence: "low", isQuery, priority: "low" };
}

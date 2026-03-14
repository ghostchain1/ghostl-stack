/**
 * DecisionEngine — autonomous decision-making using memory and knowledge graph.
 */
export interface DecisionContext {
  type:    string;
  data?:   Record<string, unknown>;
}

export interface Decision {
  action:  string;
  reason:  string;
  risk:    "LOW" | "MEDIUM" | "HIGH";
}

const DECISION_RULES: Array<{
  matches: (ctx: DecisionContext) => boolean;
  decide:  (ctx: DecisionContext) => Decision;
}> = [
  {
    matches: ctx => ctx.type === "node_failure",
    decide:  ()  => ({ action: "restart_node",           reason: "Node offline detected",          risk: "MEDIUM" }),
  },
  {
    matches: ctx => ctx.type === "gas_spike",
    decide:  ()  => ({ action: "adjust_gas_engine",       reason: "Gas price spike detected",       risk: "LOW"    }),
  },
  {
    matches: ctx => ctx.type === "validator_attack",
    decide:  ()  => ({ action: "isolate_validator",       reason: "Validator compromise detected",  risk: "HIGH"   }),
  },
  {
    matches: ctx => ctx.type === "liquidity_drop",
    decide:  ()  => ({ action: "rebalance_liquidity",     reason: "Liquidity below threshold",      risk: "MEDIUM" }),
  },
  {
    matches: ctx => ctx.type === "build_error",
    decide:  ()  => ({ action: "trigger_error_repair",    reason: "Build failure detected",         risk: "LOW"    }),
  },
  {
    matches: ctx => ctx.type === "performance_drop",
    decide:  ()  => ({ action: "scale_rpc_nodes",         reason: "RPC latency exceeded threshold", risk: "LOW"    }),
  },
];

export class DecisionEngine {
  decide(context: DecisionContext): Decision {
    for (const rule of DECISION_RULES) {
      if (rule.matches(context)) return rule.decide(context);
    }
    return { action: "monitor", reason: "No specific rule matched", risk: "LOW" };
  }
}

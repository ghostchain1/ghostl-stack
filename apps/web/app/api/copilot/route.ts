/**
 * app/api/copilot/route.ts
 *
 * Next.js App Router API route — POST /api/copilot
 *
 * Self-contained AIOC pipeline (interpret → classify → translate →
 * validate → execute). Optionally proxies to the standalone AIOC
 * microservice when AIOC_URL is set.
 */

import { NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommandEntities {
  region?:  string;
  service?: string;
  count?:   number;
  layer?:   string;
  target?:  string;
}

interface ParsedCommand {
  raw:        string;
  normalized: string;
  tokens:     string[];
  isQuery:    boolean;
  entities:   CommandEntities;
}

interface ClassifiedIntent {
  intent:     string;
  confidence: "high" | "medium" | "low";
  isQuery:    boolean;
  priority:   "emergency" | "high" | "normal" | "low";
}

interface CommandTask { type: "command"; target: string; action: string; params?: Record<string, unknown>; priority: string; }
interface QueryTask   { type: "query";   queryType: string; fetchUrls: string[]; }
type OrchestratorTask = CommandTask | QueryTask;

interface SafetyResult { ok: boolean; reason?: string; requiresConfirmation?: boolean; }
interface ExecutionResult { ok: boolean; commandId?: string; answer?: string; data?: unknown; error?: string; queued?: boolean; }

// ── Stage 1: interpret ────────────────────────────────────────────────────────

const REGIONS  = ["europe","eu","asia","ap","usa","us","america","global","all","east","west","north","south"];
const SERVICE_MAP: Record<string, string> = {
  validator: "validator-fabric", validators: "validator-fabric",
  rpc: "aim", node: "aim", nodes: "aim",
  chain: "multichain", ghostchain: "multichain",
  kernel: "kernel",
  governance: "governance",
  security: "tds", threat: "tds",
  economic: "economic", economy: "economic", liquidity: "economic", treasury: "economic",
  compliance: "acge",
  telemetry: "data-mesh", data: "data-mesh",
  evolution: "evolution",
  intelligence: "gin", swarm: "gin",
  orchestrator: "uo", uo: "uo",
};
const QUERY_SIGNALS = ["how many","how much","what is","what's","which","show me","show","tell me","list","status of","status","report","summary","is there","are there","do we have"];

function interpret(raw: string): ParsedCommand {
  const normalized = raw.toLowerCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ");
  const tokens = normalized.split(" ");

  const isQuery = QUERY_SIGNALS.some((s) => normalized.includes(s));
  const region  = REGIONS.find((r) => normalized.includes(r));
  let   service: string | undefined;
  for (const token of tokens) {
    if (SERVICE_MAP[token]) { service = SERVICE_MAP[token]; break; }
  }
  const countM = normalized.match(/\b(\d+)\b/);
  const count  = countM ? parseInt(countM[1]) : undefined;
  const layerM = normalized.match(/\bl([123])\b/);
  const layer  = layerM ? `L${layerM[1]}` : undefined;

  return { raw, normalized, tokens, isQuery, entities: { region, service, count, layer } };
}

// ── Stage 2: classify ─────────────────────────────────────────────────────────

const ACTION_RULES: Array<{ keywords: string[]; any?: string[]; intent: string; priority?: ClassifiedIntent["priority"] }> = [
  { keywords: ["deploy"],     any: ["validator","validators"], intent: "deploy_validator" },
  { keywords: ["remove","validator"],                          intent: "remove_validator",    priority: "high" },
  { keywords: ["migrate","validator"],                         intent: "migrate_validator",   priority: "high" },
  { keywords: ["scale"],      any: ["rpc","node","nodes"],     intent: "scale_rpc" },
  { keywords: ["restart"],    any: ["node","rpc","service"],   intent: "restart_node",        priority: "high" },
  { keywords: ["pause"],      any: ["service","node"],         intent: "pause_service",       priority: "high" },
  { keywords: ["resume"],     any: ["service","node"],         intent: "resume_service" },
  { keywords: ["scan"],       any: ["security","network"],     intent: "security_scan",       priority: "high" },
  { keywords: ["vulnerability"],                               intent: "security_scan",       priority: "high" },
  { keywords: ["threat","response"],                           intent: "threat_response",     priority: "high" },
  { keywords: ["optimize"],   any: ["gas","fees"],             intent: "optimize_gas" },
  { keywords: ["rebalance"],  any: ["liquidity","pool"],       intent: "rebalance_liquidity" },
  { keywords: ["optimize"],   any: ["tokenomics"],             intent: "optimize_tokenomics" },
  { keywords: ["simulate"],                                    intent: "run_simulation" },
  { keywords: ["sync","governance"],                           intent: "sync_governance" },
  { keywords: ["vote"],       any: ["governance","proposal"],  intent: "governance_vote" },
  { keywords: ["execute","proposal"],                          intent: "execute_proposal",    priority: "high" },
  { keywords: ["evolve"],     any: ["agent","agents"],         intent: "evolve_agents" },
  { keywords: ["flush"],      any: ["telemetry","data"],       intent: "flush_telemetry" },
  { keywords: ["sync"],       any: ["peer","peers"],           intent: "sync_peers" },
  { keywords: ["compliance"], any: ["audit","scan","check"],   intent: "compliance_audit" },
  { keywords: ["audit"],                                       intent: "compliance_audit" },
  { keywords: ["deploy"],     any: ["contract","smart"],       intent: "deploy_contract" },
  { keywords: ["sync"],       any: ["chain","blockchain"],     intent: "sync_chain" },
  { keywords: ["health"],                                      intent: "health_check" },
  { keywords: ["emergency"],  any: ["shutdown","halt"],        intent: "emergency_shutdown",  priority: "emergency" },
];

const QUERY_RULES: Array<{ keywords: string[]; any?: string[]; intent: string }> = [
  { keywords: ["validator"],  any: ["how many","count","active","list"], intent: "query_validators" },
  { keywords: ["treasury"],   any: ["balance","how much","what is"],     intent: "query_treasury"   },
  { keywords: ["liquidity"],                                              intent: "query_liquidity"  },
  { keywords: ["cpu","load"],                                            intent: "query_node_load"  },
  { keywords: ["health"],     any: ["system","show","status"],           intent: "query_health"     },
  { keywords: ["task"],       any: ["active","running","queued"],        intent: "query_tasks"      },
  { keywords: ["alert"],                                                  intent: "query_alerts"     },
  { keywords: ["chain"],      any: ["status","block","height"],          intent: "query_chain"      },
  { keywords: ["compliance"],                                             intent: "query_compliance" },
];

function ruleMatches(n: string, rule: { keywords: string[]; any?: string[] }): boolean {
  if (!rule.keywords.every((k) => n.includes(k))) return false;
  if (rule.any && rule.any.length > 0) return rule.any.some((k) => n.includes(k));
  return true;
}

function classify(parsed: ParsedCommand): ClassifiedIntent {
  const n = parsed.normalized;
  if (parsed.isQuery) {
    for (const r of QUERY_RULES) {
      if (ruleMatches(n, r)) return { intent: r.intent, confidence: "high", isQuery: true, priority: "low" };
    }
    if (n.includes("validator")) return { intent: "query_validators", confidence: "medium", isQuery: true, priority: "low" };
    if (n.includes("health"))    return { intent: "query_health",     confidence: "medium", isQuery: true, priority: "low" };
    if (n.includes("treasury"))  return { intent: "query_treasury",   confidence: "medium", isQuery: true, priority: "low" };
  }
  for (const r of ACTION_RULES) {
    if (ruleMatches(n, r)) return { intent: r.intent, confidence: "high", isQuery: false, priority: r.priority ?? "normal" };
  }
  if (n.includes("health"))   return { intent: "health_check",   confidence: "low", isQuery: false, priority: "normal" };
  if (n.includes("security")) return { intent: "security_scan",  confidence: "low", isQuery: false, priority: "high"   };
  if (n.includes("gas"))      return { intent: "optimize_gas",   confidence: "low", isQuery: false, priority: "normal" };
  return { intent: "unknown", confidence: "low", isQuery: parsed.isQuery, priority: "low" };
}

// ── Stage 3: translate ────────────────────────────────────────────────────────

const UO_URL       = process.env["UO_URL"]       ?? "http://localhost:9990";
const KERNEL_URL   = process.env["KERNEL_URL"]   ?? "http://localhost:9300";
const EIE_URL      = process.env["EIE_URL"]      ?? "http://localhost:9800";
const VF_URL       = process.env["VF_URL"]       ?? "http://localhost:9700";

const ACTION_TARGETS: Record<string, { target: string; action: string }> = {
  deploy_validator:    { target: "validator-fabric", action: "deploy"                },
  remove_validator:    { target: "validator-fabric", action: "remove"                },
  migrate_validator:   { target: "validator-fabric", action: "migrate"               },
  scale_rpc:           { target: "aim",              action: "scale"                 },
  restart_node:        { target: "aim",              action: "restart"               },
  pause_service:       { target: "kernel",           action: "pause"                 },
  resume_service:      { target: "kernel",           action: "resume"                },
  security_scan:       { target: "tds",              action: "scan"                  },
  threat_response:     { target: "tds",              action: "respond"               },
  firewall_update:     { target: "tds",              action: "update-firewall"       },
  optimize_gas:        { target: "economic",         action: "optimize-gas"          },
  rebalance_liquidity: { target: "economic",         action: "rebalance"             },
  optimize_tokenomics: { target: "economic",         action: "optimize-tokenomics"   },
  run_simulation:      { target: "economic",         action: "run-simulation"        },
  sync_governance:     { target: "governance",       action: "sync"                  },
  governance_vote:     { target: "governance",       action: "vote"                  },
  execute_proposal:    { target: "governance",       action: "execute"               },
  evolve_agents:       { target: "evolution",        action: "evolve"                },
  flush_telemetry:     { target: "data-mesh",        action: "flush"                 },
  sync_peers:          { target: "gin",              action: "sync-peers"            },
  compliance_audit:    { target: "acge",             action: "audit"                 },
  deploy_contract:     { target: "multichain",       action: "deploy-contract"       },
  sync_chain:          { target: "multichain",       action: "sync"                  },
  health_check:        { target: "kernel",           action: "health"                },
  emergency_shutdown:  { target: "kernel",           action: "emergency-shutdown"    },
};

const QUERY_FETCH: Record<string, string[]> = {
  query_validators: [`${VF_URL}/validators`],
  query_treasury:   [`${EIE_URL}/treasury`],
  query_liquidity:  [`${EIE_URL}/liquidity`],
  query_node_load:  [`${UO_URL}/systems`],
  query_health:     [`${UO_URL}/systems`, `${KERNEL_URL}/health`],
  query_tasks:      [`${KERNEL_URL}/tasks`],
  query_alerts:     [`${UO_URL}/alerts`],
  query_chain:      [`${UO_URL}/status`],
  query_compliance: [`${UO_URL}/status`],
};

function translate(cls: ClassifiedIntent, entities: CommandEntities): OrchestratorTask {
  if (cls.isQuery || cls.intent.startsWith("query_")) {
    return { type: "query", queryType: cls.intent, fetchUrls: QUERY_FETCH[cls.intent] ?? [`${UO_URL}/status`] };
  }
  const spec = ACTION_TARGETS[cls.intent] ?? { target: "kernel", action: "health" };
  const params: Record<string, unknown> = {};
  if (entities.region) params["region"] = entities.region;
  if (entities.count !== undefined) params["count"] = entities.count;
  if (entities.layer)  params["layer"]  = entities.layer;
  const t: CommandTask = { type: "command", target: spec.target, action: spec.action, priority: cls.priority ?? "normal" };
  if (Object.keys(params).length) t.params = params;
  return t;
}

// ── Stage 4: validate ─────────────────────────────────────────────────────────

const FORBIDDEN_ACTIONS = new Set(["delete_chain","wipe_chain","wipe","destroy","drop","nuke","format","purge"]);
const NEEDS_CONFIRM     = new Set(["emergency-shutdown","remove","execute","respond"]);

function validate(task: OrchestratorTask, confirmed: boolean): SafetyResult {
  if (task.type === "query") return { ok: true };
  if (!task.target || !task.action) return { ok: false, reason: "Missing target or action" };
  if (FORBIDDEN_ACTIONS.has(task.action)) return { ok: false, reason: `Action "${task.action}" is permanently forbidden` };
  if (NEEDS_CONFIRM.has(task.action) && !confirmed) {
    return { ok: false, reason: `Action "${task.action}" requires confirmation`, requiresConfirmation: true };
  }
  if (task.priority === "emergency" && !confirmed) {
    return { ok: false, reason: "Emergency-priority actions require { confirm: true }", requiresConfirmation: true };
  }
  return { ok: true };
}

// ── Stage 5: execute ──────────────────────────────────────────────────────────

function formatAnswer(queryType: string, results: unknown[]): string {
  try {
    const d = results[0] as Record<string, unknown> | null;
    if (!d) return "Data is currently unavailable.";
    switch (queryType) {
      case "query_validators": {
        const count = (d["active"] as number | undefined) ?? (d["validators"] as unknown[] | undefined)?.length;
        return count !== undefined ? `${count} active validators.` : "Validator data unavailable.";
      }
      case "query_treasury": {
        const bal = (d["totalUsd"] as number | undefined) ?? (d["balance"] as number | undefined);
        return bal !== undefined ? `Treasury balance: $${Number(bal).toLocaleString()} USD.` : "Treasury data unavailable.";
      }
      case "query_liquidity": {
        const liq = d["totalLiquidity"] as number | undefined;
        return liq !== undefined ? `Liquidity pool: $${Number(liq).toLocaleString()} USD.` : "Liquidity data unavailable.";
      }
      case "query_health": {
        const h = (d["healthySystems"] as number | undefined) ?? (d["healthy"] as number | undefined);
        const t = (d["totalSystems"]   as number | undefined) ?? (d["total"]   as number | undefined);
        return h !== undefined && t !== undefined ? `${h}/${t} systems healthy.` : "Health data unavailable.";
      }
      case "query_tasks": {
        const count = (d["active"] as number | undefined) ?? (d["tasks"] as unknown[] | undefined)?.length;
        return count !== undefined ? `${count} active tasks in the queue.` : "Task data unavailable.";
      }
      case "query_alerts": {
        const alerts = (d["alerts"] as unknown[] | undefined) ?? [];
        return alerts.length > 0 ? `${alerts.length} active alert(s).` : "No active alerts.";
      }
      case "query_chain": {
        const bh = d["blockHeight"] as number | undefined;
        return bh !== undefined ? `Chain at block ${Number(bh).toLocaleString()}.` : "Chain data unavailable.";
      }
      case "query_compliance": {
        const score = d["complianceScore"] as number | undefined;
        return score !== undefined ? `Compliance score: ${score}%.` : "Compliance data unavailable.";
      }
      default: return "Query completed.";
    }
  } catch { return "Query completed."; }
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

async function executeTask(task: OrchestratorTask): Promise<ExecutionResult> {
  if (task.type === "query") {
    const results = await Promise.all(task.fetchUrls.map((u) => safeFetch(u)));
    return { ok: true, answer: formatAnswer(task.queryType, results), data: results };
  }
  try {
    const res = await fetch(`${UO_URL}/command`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...task, source: "aioc", requester: "copilot" }),
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { ok: false, error: `UO ${res.status}` };
    const data = await res.json() as { commandId?: string; queued?: boolean };
    return { ok: true, commandId: data.commandId, queued: data.queued ?? true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Optional proxy to standalone AIOC service
  const aiocUrl = process.env["AIOC_URL"];
  if (aiocUrl) {
    try {
      const upstream = await fetch(`${aiocUrl}/process`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    req.body,
        signal:  AbortSignal.timeout(20_000),
      });
      const data: unknown = await upstream.json();
      return NextResponse.json(data, { status: upstream.status });
    } catch {
      // Fall through to inline processing
    }
  }

  let body: { command?: unknown; confirm?: unknown };
  try {
    body = await req.json() as { command?: unknown; confirm?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.command !== "string" || body.command.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "body.command must be a non-empty string" }, { status: 400 });
  }

  const raw       = body.command.trim();
  const confirmed = body.confirm === true;

  try {
    const parsed   = interpret(raw);
    const cls      = classify(parsed);
    const task     = translate(cls, parsed.entities);
    const safety   = validate(task, confirmed);

    let result: ExecutionResult;
    if (!safety.ok) {
      result = { ok: false, error: safety.reason };
    } else {
      result = await executeTask(task);
    }

    return NextResponse.json({
      input:      raw,
      normalized: parsed.normalized,
      intent:     cls.intent,
      confidence: cls.confidence,
      entities:   parsed.entities,
      task,
      safety,
      result,
      timestamp:  Date.now(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

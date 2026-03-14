/**
 * Ghost AI Swarm Bridge
 * =====================
 * Connects GhostBrain Core to the ghost-ai-swarm HTTP service (port 4080).
 *
 * When GhostBrain's swarm engine dispatches a task that no internal agent
 * can handle, this bridge forwards it to the external ghost-ai-swarm REST API,
 * which has 7 specialised agents: builder, auditor, defender, optimizer,
 * infra, governance, treasury.
 *
 * All writes are DRY_RUN by default until GHOSTBRAIN_SWARM_BRIDGE_DRY_RUN=0.
 * No shell execution — only HTTP calls via stdlib fetch (Node 22+).
 */

import { log } from "../observability/event_logger.js";

const SWARM_URL   = process.env["GHOSTBRAIN_SWARM_BRIDGE_URL"]     ?? "http://127.0.0.1:4080";
const TIMEOUT_MS  = parseInt(process.env["GHOSTBRAIN_SWARM_BRIDGE_TIMEOUT_MS"] ?? "8000", 10);
const DRY_RUN     = process.env["GHOSTBRAIN_SWARM_BRIDGE_DRY_RUN"] !== "0";

// ── Metric stubs (wired to the existing ghostbrain metrics exporter) ─────────
let _forwarded = 0;
let _failed    = 0;

export interface BridgeResult {
  ok:      boolean;
  dryRun:  boolean;
  agent:   string;
  detail:  string;
  ts:      string;
}

// ── Endpoint map from domain/type → ghost-ai-swarm route ────────────────────
function resolveEndpoint(domain: string, type: string): string | null {
  if (domain === "devops" || type.includes("build") || type.includes("upgrade"))
    return "/agents/build";
  if (domain === "security" || type.includes("audit") || type.includes("scan"))
    return "/agents/audit";
  if (type.includes("threat") || type.includes("attack") || type.includes("alert"))
    return "/agents/defend";
  if (domain === "performance" || type.includes("optim"))
    return "/agents/optimize";
  if (domain === "infrastructure" || type.includes("infra") || type.includes("node") || type.includes("repair"))
    return "/agents/infra";
  if (domain === "recovery" || type.includes("recovery"))
    return "/agents/infra";
  // No matching agent in ghost-ai-swarm — caller must handle internally
  return null;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function swarmPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SWARM_URL}${path}`, {
      method:  "POST",
      signal:  controller.signal,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    let resBody: unknown;
    try { resBody = await res.json(); } catch { resBody = {}; }
    return { ok: res.ok, status: res.status, body: resBody };
  } catch (err) {
    return { ok: false, status: 0, body: { error: err instanceof Error ? err.message : String(err) } };
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Forward a swarm task to the ghost-ai-swarm service.
 * Returns null when no matching agent is available in the external swarm.
 */
export async function forwardToSwarm(
  domain: string,
  type:   string,
  data:   Record<string, unknown>,
  dryRun = DRY_RUN
): Promise<BridgeResult | null> {
  const endpoint = resolveEndpoint(domain, type);
  if (!endpoint) return null;

  if (dryRun) {
    log.info("swarm_bridge: dry_run", `domain=${domain} type=${type} endpoint=${endpoint}`);
    _forwarded++;
    return {
      ok:     true,
      dryRun: true,
      agent:  endpoint.replace("/agents/", ""),
      detail: `[dry-run] would forward to ghost-ai-swarm${endpoint}`,
      ts:     new Date().toISOString(),
    };
  }

  const res = await swarmPost(endpoint, { ...data, target: data["target"] ?? type });

  if (res.ok) {
    _forwarded++;
    log.info("swarm_bridge: forwarded", `domain=${domain} type=${type} endpoint=${endpoint} status=${res.status}`);
  } else {
    _failed++;
    log.warn("swarm_bridge: forward_failed", `domain=${domain} type=${type} endpoint=${endpoint} status=${res.status}`);
  }

  const body = res.body as Record<string, unknown>;
  return {
    ok:     res.ok,
    dryRun: false,
    agent:  (body?.["agent"] as string) ?? endpoint.replace("/agents/", ""),
    detail: (body?.["detail"] as string) ?? `HTTP ${res.status}`,
    ts:     new Date().toISOString(),
  };
}

/**
 * Trigger a security alert on the defender agent.
 * Used by ghostbrain's anomaly detector and threat detection pipeline.
 */
export async function forwardSecurityAlert(opts: {
  source:   string;
  severity: "low" | "medium" | "high" | "critical";
  detail:   string;
  dryRun?:  boolean;
}): Promise<BridgeResult | null> {
  const endpoint = "/agents/defend";
  const body = { source: opts.source, severity: opts.severity, detail: opts.detail };

  if (opts.dryRun ?? DRY_RUN) {
    return {
      ok: true, dryRun: true,
      agent: "defender",
      detail: `[dry-run] would forward security-alert [${opts.severity}] from ${opts.source}`,
      ts: new Date().toISOString(),
    };
  }

  const res = await swarmPost(endpoint, body);
  _forwarded += res.ok ? 1 : 0;
  _failed    += res.ok ? 0 : 1;
  const resBody = res.body as Record<string, unknown>;
  return {
    ok:     res.ok,
    dryRun: false,
    agent:  "defender",
    detail: (resBody?.["detail"] as string) ?? `HTTP ${res.status}`,
    ts:     new Date().toISOString(),
  };
}

/**
 * Get the health of the ghost-ai-swarm service.
 * Polled by GhostBrain's cluster health aggregator.
 */
export async function swarmBridgeHealth(): Promise<{
  reachable: boolean;
  healthScore?: number;
  status?: string;
  ts: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${SWARM_URL}/swarm-health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, ts: new Date().toISOString() };
    const body = await res.json() as { healthScore?: number; status?: string };
    return { reachable: true, healthScore: body.healthScore, status: body.status, ts: new Date().toISOString() };
  } catch {
    return { reachable: false, ts: new Date().toISOString() };
  }
}

export function swarmBridgeStats() {
  return { forwarded: _forwarded, failed: _failed, dryRun: DRY_RUN, swarmUrl: SWARM_URL };
}

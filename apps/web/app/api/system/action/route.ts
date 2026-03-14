/**
 * POST /api/system/action
 *
 * Authenticated action dispatcher for the GSCC AI Engine Control Panel.
 *
 * Requires a Bearer token matching the GSCC_SECRET environment variable.
 * Actions are routed to specific microservice endpoints — no arbitrary URL
 * or command injection is possible because only a fixed actionMap is used.
 *
 * Set GSCC_SECRET in .env.local (e.g. a strong random string).
 * If GSCC_SECRET is unset the endpoint returns 503 to prevent open access.
 */

import { NextRequest, NextResponse } from "next/server";

const GSCC_SECRET = process.env.GSCC_SECRET;

type Method = "POST" | "GET";
interface ActionDef {
  serviceId: string;
  url: string;
  method: Method;
  path: string;
  description: string;
}

function buildActionMap(): Record<string, ActionDef> {
  const AIMS = process.env.NEXT_PUBLIC_AIMS_URL ?? "http://localhost:9970";
  const VGE  = process.env.NEXT_PUBLIC_VGE_URL  ?? "http://localhost:9971";
  const AAE  = process.env.NEXT_PUBLIC_AAE_URL  ?? "http://localhost:9972";
  const GEE  = process.env.NEXT_PUBLIC_GEE_URL  ?? "http://localhost:9973";
  const AEE  = process.env.NEXT_PUBLIC_AEE_URL  ?? "http://localhost:9974";
  const AIE  = process.env.NEXT_PUBLIC_AIE_URL  ?? "http://localhost:9975";
  const ASE  = process.env.NEXT_PUBLIC_ASE_URL  ?? "http://localhost:9976";
  const GIE  = process.env.NEXT_PUBLIC_GIE_URL  ?? "http://localhost:9977";
  const AGE  = process.env.NEXT_PUBLIC_AGE_URL  ?? "http://localhost:9978";
  const GIEX = process.env.NEXT_PUBLIC_GIEX_URL ?? "http://localhost:9979";
  const GAAN   = process.env.NEXT_PUBLIC_GAAN_URL   ?? "http://localhost:9981";
  const ADE    = process.env.NEXT_PUBLIC_ADE_URL    ?? "http://localhost:9982";
  const AI_EVO = process.env.NEXT_PUBLIC_AI_EVO_URL ?? "http://localhost:9983";
  const PNE    = process.env.NEXT_PUBLIC_PNE_URL    ?? "http://localhost:9984";
  const INE    = process.env.NEXT_PUBLIC_INE_URL    ?? "http://localhost:9985";
  const HCL    = process.env.NEXT_PUBLIC_HCL_URL    ?? "http://localhost:9986";
  const ARE    = process.env.NEXT_PUBLIC_ARE_URL    ?? "http://localhost:9987";

  return {
    // ── AI Marketing (AIMS) ──────────────────────────────────────────────
    "aims-run-campaign":    { serviceId: "aims", url: AIMS, method: "POST", path: "/campaigns/run",        description: "Run marketing campaign cycle" },
    "aims-publish-seo":     { serviceId: "aims", url: AIMS, method: "POST", path: "/seo/publish",          description: "Publish SEO content" },
    "aims-outreach":        { serviceId: "aims", url: AIMS, method: "POST", path: "/outreach/run",         description: "Run influencer outreach" },
    // ── Viral Growth (VGE) ──────────────────────────────────────────────
    "vge-launch-campaign":  { serviceId: "vge",  url: VGE,  method: "POST", path: "/campaigns/viral/launch", description: "Launch viral campaign" },
    "vge-run-airdrop":      { serviceId: "vge",  url: VGE,  method: "POST", path: "/airdrops/run",           description: "Execute airdrop round" },
    "vge-create-meme":      { serviceId: "vge",  url: VGE,  method: "POST", path: "/memes/generate",         description: "Generate AI meme content" },
    // ── Adoption Engine (AAE) ───────────────────────────────────────────
    "aae-dev-scan":         { serviceId: "aae",  url: AAE,  method: "POST", path: "/developers/outreach/run", description: "Run developer outreach scan" },
    "aae-onboard-projects": { serviceId: "aae",  url: AAE,  method: "POST", path: "/projects/onboard",        description: "Onboard ecosystem projects" },
    "aae-approve-grants":   { serviceId: "aae",  url: AAE,  method: "POST", path: "/grants/approve",          description: "Approve pending grants" },
    // ── Expansion Engine (GEE) ──────────────────────────────────────────
    "gee-run-listings":     { serviceId: "gee",  url: GEE,  method: "POST", path: "/exchanges/apply",         description: "Submit exchange listing applications" },
    "gee-negotiate":        { serviceId: "gee",  url: GEE,  method: "POST", path: "/partnerships/negotiate",  description: "Run partnership negotiations" },
    "gee-press-release":    { serviceId: "gee",  url: GEE,  method: "POST", path: "/media/release",           description: "Publish press release" },
    // ── Autonomous Economy (AEE) ────────────────────────────────────────
    "aee-burn-tokens":      { serviceId: "aee",  url: AEE,  method: "POST", path: "/burns/manual",            description: "Trigger manual token burn" },
    "aee-rebalance-pools":  { serviceId: "aee",  url: AEE,  method: "POST", path: "/liquidity/rebalance",     description: "Rebalance liquidity pools" },
    "aee-adjust-supply":    { serviceId: "aee",  url: AEE,  method: "POST", path: "/supply/adjust",           description: "Run supply controller" },
    // ── Autonomous Infrastructure (AIE) ─────────────────────────────────
    "aie-repair-run":       { serviceId: "aie",  url: AIE,  method: "POST", path: "/repair/run",              description: "Run auto-repair cycle" },
    "aie-balance-run":      { serviceId: "aie",  url: AIE,  method: "POST", path: "/balance/run",             description: "Run resource balancer" },
    "aie-scaling-run":      { serviceId: "aie",  url: AIE,  method: "POST", path: "/scaling/run",             description: "Run node scaler" },
    // ── Autonomous Security (ASE) ────────────────────────────────────────
    "ase-threat-scan":      { serviceId: "ase",  url: ASE,  method: "POST", path: "/threats/scan",            description: "Run threat detection scan" },
    "ase-ddos-check":       { serviceId: "ase",  url: ASE,  method: "POST", path: "/network/check",           description: "Run DDoS analysis pass" },
    "ase-intrusion-check":  { serviceId: "ase",  url: ASE,  method: "POST", path: "/intrusion/scan",          description: "Run intrusion detection scan" },
    // ── Ghost Intelligence Engine (GIE) ──────────────────────────────────
    "gie-collect-data":     { serviceId: "gie",  url: GIE,  method: "POST", path: "/data/snapshot",           description: "Trigger ecosystem snapshot collection" },
    "gie-run-predictions":  { serviceId: "gie",  url: GIE,  method: "POST", path: "/predictions",             description: "Run prediction engine cycle" },
    "gie-optimize-decisions": { serviceId: "gie", url: GIE, method: "POST", path: "/decisions/optimize",      description: "Run decision optimiser" },
    // ── Autonomous Governance Engine (AGE) ──────────────────────────────
    "age-generate-proposal":  { serviceId: "age",  url: AGE,  method: "POST", path: "/proposals/generate",      description: "Auto-generate governance proposal" },
    "age-run-simulations":    { serviceId: "age",  url: AGE,  method: "GET",  path: "/simulate",                description: "Retrieve latest policy simulations" },
    "age-predict-votes":      { serviceId: "age",  url: AGE,  method: "GET",  path: "/voting",                  description: "Retrieve AI voting predictions" },
    // ── Interchain Expansion Engine (GIE-X) ─────────────────────────────
    "giex-run-discovery":     { serviceId: "giex", url: GIEX, method: "GET",  path: "/chains/scan",             description: "Run interchain chain discovery cycle" },
    "giex-take-snapshot":     { serviceId: "giex", url: GIEX, method: "GET",  path: "/analytics/snapshot",      description: "Take multichain analytics snapshot" },
    "giex-bridge-stats":      { serviceId: "giex", url: GIEX, method: "GET",  path: "/bridges/stats",           description: "Retrieve bridge deployment statistics" },
    // ── Autonomous AI Agent Network (GAAN) ──────────────────────────────
    "gaan-run-coordination":   { serviceId: "gaan", url: GAAN, method: "POST", path: "/coordination/run",        description: "Trigger a full agent coordination cycle" },
    "gaan-run-all-agents":     { serviceId: "gaan", url: GAAN, method: "POST", path: "/agents/infrastructure-agent/run", description: "Trigger all agent ticks" },
    "gaan-network-snapshot":   { serviceId: "gaan", url: GAAN, method: "GET",  path: "/network",                 description: "Retrieve latest network snapshot" },
    // ── Autonomous Development Engine (ADE) ─────────────────────────────
    "ade-run-loop":            { serviceId: "ade",  url: ADE,  method: "POST", path: "/loop/run",               description: "Trigger autonomous development loop" },
    "ade-generate-code":       { serviceId: "ade",  url: ADE,  method: "POST", path: "/code/generate",          description: "Generate code for a service" },
    "ade-build-contract":      { serviceId: "ade",  url: ADE,  method: "POST", path: "/contracts/build",        description: "Build a new smart contract" },
    "ade-trigger-ci":          { serviceId: "ade",  url: ADE,  method: "POST", path: "/ci/trigger",             description: "Trigger a CI/CD pipeline" },
    // ── Self-Evolution Engine (ai-evolution) ────────────────────────────
    "evo-run-loop":             { serviceId: "ai-evolution", url: AI_EVO, method: "POST", path: "/loop/run",              description: "Trigger evolution loop" },
    "evo-analyze-architecture": { serviceId: "ai-evolution", url: AI_EVO, method: "POST", path: "/architecture/analyze",  description: "Analyze ecosystem architecture" },
    "evo-propose-upgrade":      { serviceId: "ai-evolution", url: AI_EVO, method: "POST", path: "/upgrades/propose",      description: "Propose a protocol upgrade" },
    "evo-explore-innovation":   { serviceId: "ai-evolution", url: AI_EVO, method: "POST", path: "/innovations/explore",  description: "Explore new blockchain innovations" },
    // ── Planetary Network Engine (PNE) ───────────────────────────────────
    "pne-run-loop":             { serviceId: "pne", url: PNE, method: "POST", path: "/loop/run",           description: "Trigger planetary loop" },
    "pne-deploy-node":          { serviceId: "pne", url: PNE, method: "POST", path: "/nodes/deploy",       description: "Deploy a new global network node" },
    "pne-optimize-latency":     { serviceId: "pne", url: PNE, method: "POST", path: "/latency/optimize",  description: "Optimize inter-region latency" },
    "pne-monitor-planet":       { serviceId: "pne", url: PNE, method: "GET",  path: "/monitoring/health", description: "Snapshot planetary network health" },
    // ── Interplanetary Network Engine (INE) ──────────────────────────────
    "ine-run-loop":              { serviceId: "ine", url: INE, method: "POST", path: "/loop/run",              description: "Trigger interplanetary loop" },
    "ine-deploy-satellite":     { serviceId: "ine", url: INE, method: "POST", path: "/satellites/deploy",     description: "Deploy a new satellite relay" },
    "ine-deploy-validator":     { serviceId: "ine", url: INE, method: "POST", path: "/validators/deploy",     description: "Deploy an orbital validator" },
    "ine-sync-comms":           { serviceId: "ine", url: INE, method: "POST", path: "/comms/sync",           description: "Sync deep-space comm links" },
    // ── Hypervisor Control Layer (HCL) ────────────────────────────────────────
    "hcl-run-loop":         { serviceId: "hcl", url: HCL, method: "POST", path: "/loop/run",              description: "Trigger HCL autonomous control loop" },
    "hcl-recovery-run":     { serviceId: "hcl", url: HCL, method: "POST", path: "/recovery/run",          description: "Run failure detection and auto-recovery engine" },
    "hcl-snapshot":         { serviceId: "hcl", url: HCL, method: "POST", path: "/monitoring/snapshot",   description: "Capture infrastructure health snapshot" },
    "hcl-deploy-validator": { serviceId: "hcl", url: HCL, method: "POST", path: "/nodes/deploy",          description: "Deploy a new blockchain validator node" },
    // ── Autonomous Revenue Engine (ARE) ──────────────────────────────────────
    "are-run-loop":           { serviceId: "are", url: ARE, method: "POST", path: "/loop/run",                description: "Trigger full autonomous revenue loop" },
    "are-manage-liquidity":   { serviceId: "are", url: ARE, method: "POST", path: "/defi/manage",            description: "Run DeFi liquidity management cycle" },
    "are-distribute-revenue": { serviceId: "are", url: ARE, method: "POST", path: "/treasury/distribute",   description: "Distribute accumulated revenue to treasury, validators, and ecosystem" },
    "are-distribute-rewards": { serviceId: "are", url: ARE, method: "POST", path: "/validators/distribute", description: "Distribute pending validator rewards" },
    "are-run-trading":        { serviceId: "are", url: ARE, method: "POST", path: "/trading/strategies",    description: "Execute all running trading strategies" },
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  // Returns metadata about available actions (no auth required for catalogue)
  const map = buildActionMap();
  const actions = Object.entries(map).map(([id, def]) => ({
    id,
    serviceId: def.serviceId,
    description: def.description,
    method: def.method,
    path: def.path,
  }));
  return NextResponse.json({ actions });
}

export async function POST(req: NextRequest) {
  // Guard: secret must be configured
  if (!GSCC_SECRET) {
    return NextResponse.json(
      { ok: false, error: "GSCC_SECRET is not configured on the server — action endpoint disabled" },
      { status: 503 },
    );
  }

  // Bearer token auth
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== GSCC_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: { action?: unknown; params?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (!action || typeof action !== "string") {
    return NextResponse.json({ ok: false, error: "action (string) required" }, { status: 400 });
  }

  const map = buildActionMap();
  const def = map[action];
  if (!def) {
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Proxy to microservice with timeout
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);

    // Only send a body for POST requests
    const fetchOpts: RequestInit = {
      method: def.method,
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    };
    if (def.method === "POST") {
      const params = body.params && typeof body.params === "object" ? body.params : {};
      fetchOpts.body = JSON.stringify(params);
    }

    const r = await fetch(`${def.url}${def.path}`, fetchOpts);
    clearTimeout(tid);

    let result: unknown = null;
    try { result = await r.json(); } catch { /* ignore */ }

    return NextResponse.json({ ok: r.ok, httpStatus: r.status, action, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Service unreachable: ${String(err)}` },
      { status: 502 },
    );
  }
}

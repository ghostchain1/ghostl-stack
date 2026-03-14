/**
 * GET /api/system/status
 *
 * Aggregates /health responses from all GhostStack microservices in parallel
 * with a 3-second per-service timeout. Returns a summary + per-service status
 * array for the GSCC live status panel.
 */

import { NextResponse } from "next/server";

interface ServiceDef {
  id: string;
  label: string;
  url: string;
  group: "infrastructure" | "security" | "intelligence" | "economy" | "growth";
}

const SERVICES: ServiceDef[] = [
  // ── Infrastructure ──────────────────────────────────────────────────────
  { id: "scp",    label: "Control Plane (SCP)",   url: process.env.NEXT_PUBLIC_SCP_URL      ?? "http://localhost:9500", group: "infrastructure" },
  { id: "aim",    label: "AI Infra Manager (AIM)", url: process.env.NEXT_PUBLIC_AIM_URL      ?? "http://localhost:9950", group: "infrastructure" },
  { id: "kernel", label: "Kernel",                 url: process.env.NEXT_PUBLIC_KERNEL_URL   ?? "http://localhost:9300", group: "infrastructure" },
  { id: "uo",     label: "Orchestrator (UO)",      url: process.env.NEXT_PUBLIC_UO_URL       ?? "http://localhost:9990", group: "infrastructure" },
  // ── Security ─────────────────────────────────────────────────────────────
  { id: "tds",    label: "Threat Detection (TDS)", url: process.env.NEXT_PUBLIC_TDS_URL      ?? "http://localhost:9960", group: "security" },
  { id: "acge",   label: "Compliance (ACGE)",      url: process.env.NEXT_PUBLIC_ACGE_URL     ?? "http://localhost:9920", group: "security" },
  { id: "see",    label: "Simulation (SEE)",        url: process.env.NEXT_PUBLIC_SEE_URL      ?? "http://localhost:9250", group: "security" },
  // ── Intelligence ─────────────────────────────────────────────────────────
  { id: "gin",    label: "Intelligence (GIN)",      url: process.env.NEXT_PUBLIC_GIN_URL      ?? "http://localhost:9980", group: "intelligence" },
  // ── Economy ──────────────────────────────────────────────────────────────
  { id: "eie",    label: "Economy Engine (EIE)",    url: process.env.NEXT_PUBLIC_ECONOMIC_URL ?? "http://localhost:9050", group: "economy" },
  // ── Growth Engines ────────────────────────────────────────────────────────
  { id: "aims",   label: "AI Marketing (AIMS)",     url: process.env.NEXT_PUBLIC_AIMS_URL     ?? "http://localhost:9970", group: "growth" },
  { id: "vge",    label: "Viral Growth (VGE)",      url: process.env.NEXT_PUBLIC_VGE_URL      ?? "http://localhost:9971", group: "growth" },
  { id: "aae",    label: "Adoption Engine (AAE)",   url: process.env.NEXT_PUBLIC_AAE_URL      ?? "http://localhost:9972", group: "growth" },
  { id: "gee",    label: "Expansion Engine (GEE)",  url: process.env.NEXT_PUBLIC_GEE_URL      ?? "http://localhost:9973", group: "growth" },
  { id: "aee",    label: "Economy Engine (AEE)",    url: process.env.NEXT_PUBLIC_AEE_URL      ?? "http://localhost:9974", group: "growth" },
  // ── Autonomous Engines ────────────────────────────────────────────────────
  { id: "aie",    label: "Infra Engine (AIE)",      url: process.env.NEXT_PUBLIC_AIE_URL      ?? "http://localhost:9975", group: "infrastructure" },
  { id: "ase",    label: "Security Engine (ASE)",   url: process.env.NEXT_PUBLIC_ASE_URL      ?? "http://localhost:9976", group: "security" },
  { id: "gie",    label: "Intelligence Engine (GIE)", url: process.env.NEXT_PUBLIC_GIE_URL    ?? "http://localhost:9977", group: "intelligence" },
  // ── Governance ────────────────────────────────────────────────────────────
  { id: "age",    label: "Governance Engine (AGE)",  url: process.env.NEXT_PUBLIC_AGE_URL    ?? "http://localhost:9978", group: "intelligence" },
  // ── Interchain ────────────────────────────────────────────────────────────
  { id: "giex",   label: "Interchain Engine (GIE-X)", url: process.env.NEXT_PUBLIC_GIEX_URL  ?? "http://localhost:9979", group: "intelligence" },
  // ── AI Agent Network ────────────────────────────────────────────────────
  { id: "gaan",   label: "AI Agent Network (GAAN)",    url: process.env.NEXT_PUBLIC_GAAN_URL   ?? "http://localhost:9981", group: "intelligence" },
  // ── Autonomous Development Engine ────────────────────────────────────────
  { id: "ade",    label: "Development Engine (ADE)",   url: process.env.NEXT_PUBLIC_ADE_URL    ?? "http://localhost:9982", group: "intelligence" },
  // ── Self-Evolution Engine ─────────────────────────────────────────────────
  { id: "ai-evolution", label: "Self-Evolution Engine", url: process.env.NEXT_PUBLIC_AI_EVO_URL ?? "http://localhost:9983", group: "intelligence" },
  // ── Planetary Network Engine ──────────────────────────────────────────────
  { id: "pne",    label: "Planetary Network Engine (PNE)", url: process.env.NEXT_PUBLIC_PNE_URL ?? "http://localhost:9984", group: "intelligence" },
  // ── Interplanetary Network Engine ────────────────────────────────────────
  { id: "ine",    label: "Interplanetary Network Engine (INE)", url: process.env.NEXT_PUBLIC_INE_URL ?? "http://localhost:9985", group: "intelligence" },
  // ── Hypervisor Control Layer ──────────────────────────────────────────────
  { id: "hcl",    label: "Hypervisor Control Layer (HCL)",      url: process.env.NEXT_PUBLIC_HCL_URL ?? "http://localhost:9986", group: "intelligence" },
  // ── Autonomous Revenue Engine ─────────────────────────────────────────────
  { id: "are",    label: "Autonomous Revenue Engine (ARE)",      url: process.env.NEXT_PUBLIC_ARE_URL ?? "http://localhost:9987", group: "economy" },
];

interface ServiceResult extends ServiceDef {
  online: boolean;
  status: string;
  latencyMs: number;
}

async function checkService(svc: ServiceDef): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${svc.url}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(tid);
    const latencyMs = Date.now() - start;
    let body: Record<string, unknown> = {};
    try { body = await r.json(); } catch { /* ignore */ }
    return {
      ...svc,
      online: r.ok,
      status: r.ok ? ((body.status as string) ?? "ok") : `http-${r.status}`,
      latencyMs,
    };
  } catch {
    return { ...svc, online: false, status: "unreachable", latencyMs: Date.now() - start };
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const services = await Promise.all(SERVICES.map(checkService));
  const online = services.filter((s) => s.online).length;
  return NextResponse.json({
    summary: { online, total: services.length, allOnline: online === services.length },
    services,
    timestamp: new Date().toISOString(),
  });
}

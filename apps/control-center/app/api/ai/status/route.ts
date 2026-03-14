import { NextResponse } from "next/server";
import { C3_CONFIG } from "@/config/ghostConfig";

export async function GET() {
  const checks = Object.entries(C3_CONFIG.engines).map(async ([id, cfg]) => {
    const t0 = Date.now();
    try {
      const res  = await fetch(`${cfg.url}/health`, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
      const body = res.ok ? await res.json() as Record<string, unknown> : null;
      return {
        id,
        label:     cfg.label,
        port:      cfg.port,
        group:     cfg.group,
        status:    res.ok ? "online" : "degraded",
        latencyMs: Date.now() - t0,
        uptime:    body?.uptime   ?? null,
        cycles:    (body?.loop as Record<string, unknown> | null)?.cycles ?? body?.cycles ?? null,
        version:   body?.version  ?? null,
        lastCheck: Date.now(),
      };
    } catch {
      return {
        id, label: cfg.label, port: cfg.port, group: cfg.group,
        status: "offline", latencyMs: Date.now() - t0,
        uptime: null, cycles: null, version: null, lastCheck: Date.now(),
      };
    }
  });
  return NextResponse.json(await Promise.all(checks));
}

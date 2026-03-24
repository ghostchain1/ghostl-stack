// API: Security alerts from AI Security Engine
import { NextResponse } from "next/server";

const ASE_URL        = process.env.NEXT_PUBLIC_SECURITY_AI_URL  ?? "http://localhost:9977";
const COMPLIANCE_URL = process.env.NEXT_PUBLIC_COMPLIANCE_URL   ?? "http://localhost:8090";
const SLASH_URL      = process.env.NEXT_PUBLIC_VALIDATOR_URL     ?? "http://localhost:7795";

export async function GET() {
  const [aseData, compData, slashData] = await Promise.allSettled([
    fetch(`${ASE_URL}/alerts`,          { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
    fetch(`${COMPLIANCE_URL}/status`,   { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
    fetch(`${SLASH_URL}/slashing`,      { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
  ]);

  const alerts  = aseData.status      === "fulfilled" ? (aseData.value as Record<string,unknown>[])    : [];
  const comp    = compData.status     === "fulfilled" ? (compData.value as Record<string,unknown>)      : {};
  const slashing = slashData.status   === "fulfilled" ? (slashData.value as Record<string,unknown>)    : {};

  const normalised = alerts.map((a, i) => ({
    id:        String(a.id ?? i),
    severity:  (a.severity ?? "info") as "critical" | "warn" | "info",
    title:     String(a.title ?? a.message ?? "Security alert"),
    desc:      String(a.description ?? a.desc ?? ""),
    source:    String(a.source ?? "ASE"),
    timestamp: Number(a.timestamp ?? Date.now()),
    resolved:  Boolean(a.resolved ?? false),
  }));

  const critical = normalised.filter(a => a.severity === "critical" && !a.resolved).length;

  return NextResponse.json({
    alerts,
    threatScore:      typeof (comp as Record<string,unknown>).threatScore === "number" ? (comp as Record<string,unknown>).threatScore : Math.min(100, critical * 20),
    activeThreats:    normalised.filter(a => !a.resolved).length,
    blockedIPs:       Number((comp as Record<string,unknown>).blockedIPs ?? 0),
    auditLogSize:     Number((comp as Record<string,unknown>).auditLogSize ?? 0),
    slashingEvents:   Number((slashing as Record<string,unknown>).count ?? 0),
    complianceStatus: (comp as Record<string,unknown>).status ?? (critical > 0 ? "violation" : "compliant"),
  });
}

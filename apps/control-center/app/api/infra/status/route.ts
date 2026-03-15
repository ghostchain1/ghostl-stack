import { NextResponse } from "next/server";

const HCL = process.env.NEXT_PUBLIC_HCL_URL ?? "http://localhost:9986";

export async function GET() {
  try {
    const [snapshotRes, healthRes] = await Promise.all([
      fetch(`${HCL}/snapshot`, { signal: AbortSignal.timeout(5_000), cache: "no-store" }),
      fetch(`${HCL}/health`,   { signal: AbortSignal.timeout(3_000), cache: "no-store" }),
    ]);
    const raw = snapshotRes.ok ? (await snapshotRes.json() as Record<string, unknown>) : null;
    return NextResponse.json({
      vms:        (raw?.vms        ?? []) as unknown[],
      containers: (raw?.containers ?? []) as unknown[],
      resources:  (raw?.resources  ?? null) as Record<string, number> | null,
      hclOnline:  healthRes.ok,
      timestamp:  Date.now(),
    });
  } catch {
    return NextResponse.json({ vms: [], containers: [], resources: null, hclOnline: false, timestamp: Date.now() }, { status: 503 });
  }
}


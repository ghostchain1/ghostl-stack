// API: GNS stats and name records
import { NextResponse } from "next/server";

const GNS_API = process.env.NEXT_PUBLIC_GNS_URL ?? "http://localhost:7704";

export async function GET() {
  try {
    const [statsRes, recordsRes] = await Promise.allSettled([
      fetch(`${GNS_API}/stats`,   { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
      fetch(`${GNS_API}/records`, { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
    ]);
    const stats   = statsRes.status   === "fulfilled" ? statsRes.value   as Record<string,unknown> : {};
    const records = recordsRes.status === "fulfilled" ? recordsRes.value as unknown[]              : [];
    return NextResponse.json({
      totalNames:    Number(stats.totalNames    ?? 0),
      registered24h: Number(stats.registered24h ?? 0),
      expiring7d:    Number(stats.expiring7d    ?? 0),
      totalRevenue:  Number(stats.totalRevenue  ?? 0),
      records,
    });
  } catch {
    return NextResponse.json({ totalNames: 0, registered24h: 0, expiring7d: 0, totalRevenue: 0, records: [] }, { status: 503 });
  }
}

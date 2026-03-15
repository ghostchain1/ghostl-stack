import { NextResponse } from "next/server";

const GIE = process.env.NEXT_PUBLIC_GIE_URL ?? "http://localhost:9975";

export async function GET() {
  try {
    const res  = await fetch(`${GIE}/proposals`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    const data = await res.json() as unknown;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      proposals: [],
      stats: { total: 0, active: 0, passed: 0, rejected: 0, quorumThreshold: 67 },
    });
  }
}

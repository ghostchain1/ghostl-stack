import { NextResponse } from "next/server";

const ARE = process.env.NEXT_PUBLIC_ARE_URL ?? "http://localhost:9987";

export async function GET() {
  try {
    const res  = await fetch(`${ARE}/validators`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    const list = await res.json() as Record<string, unknown>[];
    return NextResponse.json(
      list.map(v => ({
        address:     v.address,
        moniker:     `Val-${(String(v.address)).slice(-6)}`,
        votingPower: Math.round(Number(v.stakeGST ?? 0) * 0.01),
        commission:  Number(v.commission ?? 5),
        uptimePct:   Number(v.performancePct ?? 0),
        status:      v.status ?? "inactive",
      })),
    );
  } catch {
    return NextResponse.json([], { status: 503 });
  }
}

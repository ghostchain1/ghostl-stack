// API: User wallet data
import { NextResponse } from "next/server";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:7705";
const ARE_URL  = process.env.NEXT_PUBLIC_ARE_URL  ?? "http://localhost:9987";

export async function GET() {
  try {
    const [areData] = await Promise.allSettled([
      fetch(`${ARE_URL}/summary`, { signal: AbortSignal.timeout(3_000), cache: "no-store" }).then(r => r.json()),
    ]);
    const are    = areData.status === "fulfilled" ? areData.value as Record<string, unknown> : {};
    const treas  = (are.treasury ?? {}) as Record<string, number>;
    const priceUSD = Number(treas.gstPriceUSD ?? 2.84);

    // Demo wallet data (in production: read from session/JWT cookie → fetch on-chain balance)
    const gstBalance = 4_280.5;
    return NextResponse.json({
      address:    "ghost1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r",
      gstBalance,
      stakedGST:  2_000,
      pendingRewards: 14.72,
      usdValue:   gstBalance * priceUSD,
      tokens:     [],
    });
  } catch {
    return NextResponse.json({ address: "", gstBalance: 0, stakedGST: 0, pendingRewards: 0, usdValue: 0, tokens: [] });
  }
}

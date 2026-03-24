// API: GST token statistics
import { NextResponse } from "next/server";

const ARE_URL     = process.env.NEXT_PUBLIC_ARE_URL      ?? "http://localhost:9987";
const L1_RPC      = process.env.NEXT_PUBLIC_GHOSTCHAIN_RPC ?? "http://localhost:18545";
const L2_RPC      = process.env.NEXT_PUBLIC_GHOSTL2_RPC   ?? "http://localhost:29545";
const L3_RPC      = process.env.NEXT_PUBLIC_GHOSTL3_RPC   ?? "http://localhost:39545";

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(2_500), cache: "no-store",
    });
    const j = await r.json() as { result?: string };
    return j.result ?? null;
  } catch { return null; }
}

export async function GET() {
  const [areData, l1Balance, l2Balance, l3Balance] = await Promise.allSettled([
    fetch(`${ARE_URL}/summary`, { signal: AbortSignal.timeout(4_000), cache: "no-store" }).then(r => r.json()),
    rpcCall(L1_RPC, "eth_getBalance", ["0x0000000000000000000000000000000000000000", "latest"]),
    rpcCall(L2_RPC, "eth_getBalance", ["0x0000000000000000000000000000000000000000", "latest"]),
    rpcCall(L3_RPC, "eth_getBalance", ["0x0000000000000000000000000000000000000000", "latest"]),
  ]);

  const are = areData.status === "fulfilled" ? areData.value as Record<string,unknown> : {};
  const treas = (are.treasury ?? {}) as Record<string, number>;

  const totalSupply   = 1_000_000_000;  // 1B GST genesis supply
  const stakedSupply  = Number(treas.totalStakeGST ?? 10_160_000);
  const burnedAllTime = Number((are as Record<string,unknown>).burnedAllTime ?? 0);
  const priceUSD      = Number(treas.gstPriceUSD ?? 2.84);

  return NextResponse.json({
    symbol:               "GST",
    name:                 "GhostStack Token",
    priceUSD,
    priceChange24h:       Number(treas.priceChange24h ?? 0),
    marketCapUSD:         totalSupply * priceUSD,
    totalSupply,
    circulatingSupply:    totalSupply - burnedAllTime,
    stakedSupply,
    burnedAllTime,
    txCount24h:           Number((are as Record<string,unknown>).txCount24h ?? 0),
    holdersCount:         Number((are as Record<string,unknown>).holdersCount ?? 0),
    l1Balance:            l1Balance.status === "fulfilled" && l1Balance.value ? parseInt(l1Balance.value as string, 16) / 1e18 : 0,
    l2Balance:            l2Balance.status === "fulfilled" && l2Balance.value ? parseInt(l2Balance.value as string, 16) / 1e18 : 0,
    l3Balance:            l3Balance.status === "fulfilled" && l3Balance.value ? parseInt(l3Balance.value as string, 16) / 1e18 : 0,
    gstUnitWei:           "1000000000000000000",
    canonicalAddress:     "0x0000000000000000000000000000000000000GST",
  });
}

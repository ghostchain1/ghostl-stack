// API: Bridge status — queries bridge service + chain finality oracles
import { NextResponse } from "next/server";

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL        ?? "http://localhost:7702";
const L1_RPC     = process.env.NEXT_PUBLIC_GHOSTCHAIN_RPC    ?? "http://localhost:18545";
const L2_RPC     = process.env.NEXT_PUBLIC_GHOSTL2_RPC       ?? "http://localhost:29545";
const L3_RPC     = process.env.NEXT_PUBLIC_GHOSTL3_RPC       ?? "http://localhost:39545";

async function rpc(url: string, method: string) {
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(2_500), cache: "no-store",
    });
    const j = await r.json() as { result?: string };
    return j.result ?? null;
  } catch { return null; }
}

export async function GET() {
  const t0 = Date.now();

  const [bridgeData, l1Block, l2Block, l3Block] = await Promise.allSettled([
    fetch(`${BRIDGE_URL}/summary`, { signal: AbortSignal.timeout(4_000), cache: "no-store" }).then(r => r.json()),
    rpc(L1_RPC, "eth_blockNumber"),
    rpc(L2_RPC, "eth_blockNumber"),
    rpc(L3_RPC, "eth_blockNumber"),
  ]);

  const bridge = bridgeData.status === "fulfilled" ? bridgeData.value as Record<string,unknown> : {};
  const b1     = l1Block.status === "fulfilled" && l1Block.value ? parseInt(l1Block.value as string, 16) : null;
  const b2     = l2Block.status === "fulfilled" && l2Block.value ? parseInt(l2Block.value as string, 16) : null;
  const b3     = l3Block.status === "fulfilled" && l3Block.value ? parseInt(l3Block.value as string, 16) : null;

  const latency = Date.now() - t0;

  return NextResponse.json({
    l1l2: {
      tvlGST:       Number((bridge as Record<string,unknown>).l1l2Tvl    ?? 0),
      pending:      Number((bridge as Record<string,unknown>).l1l2Pending ?? 0),
      finalized24h: Number((bridge as Record<string,unknown>).l1l2Fin24h ?? 0),
      latencyMs:    latency,
      healthy:      b1 !== null && b2 !== null,
    },
    l2l3: {
      tvlGST:       Number((bridge as Record<string,unknown>).l2l3Tvl    ?? 0),
      pending:      Number((bridge as Record<string,unknown>).l2l3Pending ?? 0),
      finalized24h: Number((bridge as Record<string,unknown>).l2l3Fin24h ?? 0),
      latencyMs:    latency,
      healthy:      b2 !== null && b3 !== null,
    },
    chainBlocks: { l1: b1, l2: b2, l3: b3 },
    recentTxs:   (bridge as Record<string,unknown>).recentTxs ?? [],
  });
}

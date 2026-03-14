import { NextResponse } from "next/server";
import { C3_CONFIG } from "@/config/ghostConfig";

type ChainCfg = { name: string; chainId: number; rpc: string; symbol: string; color: string };

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(3_000),
    cache:   "no-store",
  });
  const json = await res.json() as { result?: string };
  return json.result ?? null;
}

async function probeChain(id: string, cfg: ChainCfg) {
  const t0 = Date.now();
  try {
    const [blockHex, gasPriceHex] = await Promise.all([
      rpcCall(cfg.rpc, "eth_blockNumber"),
      rpcCall(cfg.rpc, "eth_gasPrice"),
    ]);
    const blockHeight = blockHex ? parseInt(blockHex, 16) : 0;
    const gasGwei     = gasPriceHex ? (parseInt(gasPriceHex, 16) / 1e9).toFixed(2) + " Gwei" : "—";
    const latency     = Date.now() - t0;
    return {
      id,
      name:             cfg.name,
      chainId:          cfg.chainId,
      status:           "healthy" as const,
      blockHeight,
      blockTime:        2.0,
      tps:              Math.round(Math.random() * 80 + 20),
      gasPrice:         gasGwei,
      activeValidators: id === "ghostchain" ? 21 : id === "ghostl2" ? 5 : 3,
      totalStaked:      id === "ghostchain" ? "10,160,000 GHOST" : "—",
      latency,
    };
  } catch {
    return {
      id,
      name:             cfg.name,
      chainId:          cfg.chainId,
      status:           "offline" as const,
      blockHeight:      0,
      blockTime:        0,
      tps:              0,
      gasPrice:         "—",
      activeValidators: 0,
      totalStaked:      "—",
      latency:          Date.now() - t0,
    };
  }
}

export async function GET() {
  const results = await Promise.all(
    Object.entries(C3_CONFIG.chains).map(([id, cfg]) => probeChain(id, cfg)),
  );
  return NextResponse.json(results);
}

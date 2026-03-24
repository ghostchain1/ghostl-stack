// API: User transaction history
import { NextResponse } from "next/server";

const BLOCK_INDEX_URL = process.env.NEXT_PUBLIC_BLOCK_INDEX_URL ?? "http://localhost:7794";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chain  = searchParams.get("chain");
  const type   = searchParams.get("type");
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

  try {
    // In production: pass authenticated user address from session
    const address = "ghost1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r";
    const url = new URL(`${BLOCK_INDEX_URL}/txs`);
    url.searchParams.set("address", address);
    url.searchParams.set("limit",   String(limit));
    if (chain) url.searchParams.set("chain", chain);
    if (type)  url.searchParams.set("type", type);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    if (!res.ok) throw new Error("indexer offline");
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json(data);
  } catch {
    // Return demo transactions when indexer is offline
    const now = Date.now();
    return NextResponse.json({
      total: 6,
      txs: [
        { hash: "0xabc123def456abc", type: "receive",    amount: "500",  token: "GST", from: "0xVault", to: "0xUser", chain: "L1", status: "confirmed", timestamp: now - 300_000, fee: "0.01" },
        { hash: "0xdef456abc123def", type: "stake",      amount: "2000", token: "GST", from: "0xUser",  to: "0xVal",  chain: "L1", status: "confirmed", timestamp: now - 86_400_000, fee: "0.05" },
        { hash: "0x111222333444555", type: "send",        amount: "100",  token: "GST", from: "0xUser",  to: "0xFriend", chain: "L2", status: "confirmed", timestamp: now - 172_800_000, fee: "0.002" },
        { hash: "0x666777888999aaa", type: "governance",  amount: "0",    token: "GST", from: "0xUser",  to: "0xGov",  chain: "L1", status: "confirmed", timestamp: now - 259_200_000, fee: "0.001" },
        { hash: "0xbbb111ccc222ddd", type: "bridge",      amount: "200",  token: "GST", from: "0xUser",  to: "0xBridge", chain: "L1→L2", status: "confirmed", timestamp: now - 345_600_000, fee: "0.05" },
        { hash: "0xeee333fff444ggg", type: "receive",    amount: "14.72",token: "GST", from: "0xRewards","to": "0xUser", chain: "L1", status: "pending",   timestamp: now - 60_000,     fee: "0" },
      ],
    });
  }
}

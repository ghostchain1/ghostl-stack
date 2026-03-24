// API: Contract registry — returns canonical contracts + live on-chain data
import { NextResponse } from "next/server";

const CONTRACT_REG_URL = process.env.NEXT_PUBLIC_CONTRACT_REG_URL ?? "http://localhost:7703";

export async function GET() {
  try {
    const res = await fetch(`${CONTRACT_REG_URL}/contracts`, {
      signal: AbortSignal.timeout(4_000),
      cache:  "no-store",
    });
    if (!res.ok) throw new Error("registry offline");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Return canonical contracts without live on-chain data
    return NextResponse.json([], { status: 503 });
  }
}

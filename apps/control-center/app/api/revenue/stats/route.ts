import { NextResponse } from "next/server";

const ARE = process.env.NEXT_PUBLIC_ARE_URL ?? "http://localhost:9987";

export async function GET() {
  try {
    const res  = await fetch(`${ARE}/summary`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json({ ...data, timestamp: Date.now() });
  } catch {
    return NextResponse.json({ timestamp: Date.now() }, { status: 503 });
  }
}

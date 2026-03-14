import { NextResponse } from "next/server";

const HCL = process.env.NEXT_PUBLIC_HCL_URL ?? "http://localhost:9986";

export async function POST(req: Request) {
  const body = await req.json() as { nodeId?: string };
  if (!body.nodeId) {
    return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  }
  try {
    const res  = await fetch(`${HCL}/nodes/${encodeURIComponent(body.nodeId)}/restart`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json({ success: res.ok, ...data });
  } catch (err) {
    return NextResponse.json({ success: false, message: String(err) }, { status: 503 });
  }
}

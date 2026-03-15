import { NextResponse } from "next/server";

const ARE  = process.env.NEXT_PUBLIC_ARE_URL ?? "http://localhost:9987";
const AIMS = process.env.NEXT_PUBLIC_AIMS_URL ?? "http://localhost:9970";
const VGE  = process.env.NEXT_PUBLIC_VGE_URL  ?? "http://localhost:9971";

export async function GET() {
  const [aimsRes, vgeRes] = await Promise.allSettled([
    fetch(`${AIMS}/summary`, { signal: AbortSignal.timeout(4_000), cache: "no-store" }),
    fetch(`${VGE}/summary`,  { signal: AbortSignal.timeout(4_000), cache: "no-store" }),
  ]);
  const aims = aimsRes.status === "fulfilled" && aimsRes.value.ok ? await aimsRes.value.json() as unknown : null;
  const vge  = vgeRes.status  === "fulfilled" && vgeRes.value.ok  ? await vgeRes.value.json()  as unknown: null;
  return NextResponse.json({ aims, vge, are: ARE, timestamp: Date.now() });
}

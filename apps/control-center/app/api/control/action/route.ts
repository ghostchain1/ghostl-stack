import { NextResponse } from "next/server";
import { C3_CONFIG, type C3EngineId } from "@/config/ghostConfig";

interface ActionBody {
  engineId: string;
  action:   string;
  payload?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const body = await req.json() as ActionBody;
  const { engineId, action, payload } = body;

  if (!engineId || !action) {
    return NextResponse.json({ error: "engineId and action are required" }, { status: 400 });
  }

  const engine = C3_CONFIG.engines[engineId as C3EngineId];
  if (!engine) {
    return NextResponse.json({ error: `Unknown engine: ${engineId}` }, { status: 404 });
  }

  // Restrict to POST-safe action paths (no path traversal)
  const safeAction = action.replace(/\.\./g, "").replace(/^\/+/, "");

  try {
    const res = await fetch(`${engine.url}/${safeAction}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    payload ? JSON.stringify(payload) : undefined,
      signal:  AbortSignal.timeout(15_000),
    });
    const data = await res.json() as unknown;
    return NextResponse.json({ success: res.ok, engineId, action: safeAction, result: data });
  } catch (err) {
    return NextResponse.json({ success: false, engineId, action: safeAction, error: String(err) }, { status: 503 });
  }
}

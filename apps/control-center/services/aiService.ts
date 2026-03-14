// AI engine health and control service

export interface AIEngineHealth {
  id:        string;
  label:     string;
  port:      number;
  group:     string;
  status:    "online" | "offline" | "degraded";
  latencyMs: number;
  uptime:    number | null;
  cycles:    number | null;
  version:   string | null;
  lastCheck: number;
}

export async function getAIStatus(): Promise<AIEngineHealth[]> {
  const res = await fetch("/api/ai/status", { cache: "no-store" });
  if (!res.ok) throw new Error(`ai/status ${res.status}`);
  return res.json();
}

export async function triggerEngineAction(
  engineId: string,
  action:   string,
  payload?: Record<string, unknown>,
): Promise<{ success: boolean; engineId: string; action: string; result?: unknown; error?: string }> {
  const res = await fetch("/api/control/action", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ engineId, action, payload }),
  });
  return res.json();
}

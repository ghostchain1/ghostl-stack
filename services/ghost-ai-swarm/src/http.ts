/**
 * Shared HTTP helper — thin wrapper over global fetch (Node 22+).
 * No shell=True, no child_process. All agent actions go through here.
 */

const DEFAULT_TIMEOUT_MS = parseInt(process.env["GHOST_SWARM_HTTP_TIMEOUT_MS"] ?? "8000", 10);

export async function ghostFetch(
  url: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:  options.method ?? "GET",
      signal:  controller.signal,
      headers: { "Content-Type": "application/json" },
      body:    options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    let body: unknown;
    try { body = await res.json(); } catch { body = {}; }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: { error: msg } };
  } finally {
    clearTimeout(timer);
  }
}

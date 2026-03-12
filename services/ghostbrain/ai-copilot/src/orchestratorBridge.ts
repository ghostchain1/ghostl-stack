/**
 * orchestratorBridge.ts
 *
 * Stage 5 of the Copilot pipeline.
 * Forwards validated command tasks to the Universal Orchestrator,
 * or fetches read-only data for query tasks and returns structured answers.
 */

import type { OrchestratorTask } from "./taskTranslator.js";

// ── Config ────────────────────────────────────────────────────────────────────

const UO_URL = process.env["UO_URL"] ?? "http://localhost:9990";

// ── Return types ──────────────────────────────────────────────────────────────

export interface ExecutionResult {
  ok:          boolean;
  commandId?:  string;
  answer?:     string;
  data?:       unknown;
  error?:      string;
  queued?:     boolean;
}

// ── Query answer formatters ───────────────────────────────────────────────────

function formatAnswer(queryType: string, data: unknown[]): string {
  try {
    switch (queryType) {
      case "query_validators": {
        const res = data[0] as { validators?: unknown[]; active?: number } | null;
        const count = res?.active ?? (Array.isArray(res?.validators) ? res.validators.length : null);
        return count !== null
          ? `There are ${count} active validators across the network.`
          : "Validator data is currently unavailable.";
      }
      case "query_treasury": {
        const res = data[0] as { totalUsd?: number; balance?: number } | null;
        const bal = res?.totalUsd ?? res?.balance;
        return bal !== undefined
          ? `Treasury balance is $${bal.toLocaleString()} USD.`
          : "Treasury data is currently unavailable.";
      }
      case "query_liquidity": {
        const res = data[0] as { totalLiquidity?: number } | null;
        return res?.totalLiquidity !== undefined
          ? `Available liquidity pool: $${res.totalLiquidity.toLocaleString()} USD.`
          : "Liquidity data is currently unavailable.";
      }
      case "query_health": {
        const sys = data[0] as { healthy?: number; total?: number; healthySystems?: number; totalSystems?: number } | null;
        const healthy = sys?.healthySystems ?? sys?.healthy;
        const total   = sys?.totalSystems   ?? sys?.total;
        if (healthy !== undefined && total !== undefined) {
          return `${healthy}/${total} systems are healthy.`;
        }
        return "System health data is currently unavailable.";
      }
      case "query_tasks": {
        const res = data[0] as { tasks?: unknown[]; active?: number } | null;
        const count = res?.active ?? (Array.isArray(res?.tasks) ? res.tasks.length : null);
        return count !== null
          ? `There are ${count} active tasks in the queue.`
          : "Task queue data is currently unavailable.";
      }
      case "query_node_load": {
        const res = data[0] as { systems?: Array<{ name: string; latency?: number }> } | null;
        if (res?.systems?.length) {
          const highest = res.systems.reduce((a, b) => (b.latency ?? 0) > (a.latency ?? 0) ? b : a);
          return `Highest load node: ${highest.name} (${highest.latency ?? "?"}ms latency).`;
        }
        return "Node load data is currently unavailable.";
      }
      case "query_alerts": {
        const res = data[0] as { alerts?: unknown[] } | null;
        const count = res?.alerts?.length ?? 0;
        return count > 0
          ? `${count} active alert${count === 1 ? "" : "s"} detected.`
          : "No active alerts.";
      }
      case "query_chain": {
        const res = data[0] as { status?: string; blockHeight?: number } | null;
        return res?.blockHeight !== undefined
          ? `Chain is ${res.status ?? "running"} at block ${res.blockHeight.toLocaleString()}.`
          : "Chain status is currently unavailable.";
      }
      case "query_compliance": {
        const res = data[0] as { complianceScore?: number } | null;
        return res?.complianceScore !== undefined
          ? `Current compliance score: ${res.complianceScore}%.`
          : "Compliance data is currently unavailable.";
      }
      default:
        return "Query completed. See data for full details.";
    }
  } catch {
    return "Query completed. See data for full details.";
  }
}

// ── Safe fetch helper ─────────────────────────────────────────────────────────

async function safeFetch(url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    return await res.json() as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Bridge ────────────────────────────────────────────────────────────────────

export async function execute(task: OrchestratorTask): Promise<ExecutionResult> {
  // ── Query path ──
  if (task.type === "query") {
    const results = await Promise.all(task.fetchUrls.map(safeFetch));
    return {
      ok:     true,
      answer: formatAnswer(task.queryType, results),
      data:   results,
    };
  }

  // ── Command path — forward to UO ──
  const body = {
    target:    task.target,
    action:    task.action,
    params:    task.params ?? {},
    priority:  task.priority,
    source:    "aioc",
    requester: "copilot",
  };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);

    const res = await fetch(`${UO_URL}/command`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, error: `UO returned ${res.status}: ${err}` };
    }

    const result = await res.json() as { commandId?: string; queued?: boolean };
    return { ok: true, commandId: result.commandId, queued: result.queued ?? true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

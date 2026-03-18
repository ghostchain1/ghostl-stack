import type { LayerKind, ManagedUnit, UnitHealth } from "../../core/types.js";

const CHAIN_LAYERS = new Set<LayerKind>(["l1", "l2", "l3"]);

function buildUnprobedHealth(unit: ManagedUnit, detail: string): UnitHealth {
  return {
    status: unit.desiredState === "maintenance" ? "warn" : "warn",
    rpc: null,
    lastCheckAt: new Date().toISOString(),
    detail,
  };
}

export function buildLayerOverrideHealth(unit: ManagedUnit, ok: boolean): UnitHealth {
  const detail = unit.checks?.rpcUrl
    ? `${ok ? "RPC reachable" : "RPC unreachable"} at ${unit.checks.rpcUrl}`
    : ok
      ? "unit healthy by layer override"
      : "unit unhealthy by layer override";

  return {
    status: ok ? "ok" : unit.desiredState === "maintenance" ? "warn" : "fail",
    rpc: ok,
    lastCheckAt: new Date().toISOString(),
    detail,
  };
}

export async function probeManagedUnit(unit: ManagedUnit, timeoutMs = 8_000): Promise<UnitHealth> {
  if (unit.desiredState === "maintenance") {
    return buildUnprobedHealth(unit, "unit held in maintenance");
  }

  const rpcUrl = unit.checks?.rpcUrl;
  if (!rpcUrl || !CHAIN_LAYERS.has(unit.layer)) {
    const healthPath = unit.checks?.healthPath;
    if (healthPath?.startsWith("http://") || healthPath?.startsWith("https://")) {
      try {
        const res = await fetch(healthPath, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
        });

        return {
          status: res.ok ? "ok" : "fail",
          rpc: null,
          lastCheckAt: new Date().toISOString(),
          detail: res.ok ? `health endpoint reachable at ${healthPath}` : `health endpoint returned HTTP ${res.status}`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          status: "fail",
          rpc: null,
          lastCheckAt: new Date().toISOString(),
          detail: msg,
        };
      }
    }

    return buildUnprobedHealth(unit, healthPath ?? "no ghost RPC probe configured");
  }

  let lastError = "RPC probe failed";

  for (const method of ["ghost_blockNumber", "eth_blockNumber"]) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status} for ${method}`;
        continue;
      }

      const body = await res.json() as { result?: string; error?: { message?: string } };
      const ok = typeof body.result === "string" && body.result.startsWith("0x");
      if (!ok) {
        lastError = body.error?.message ?? `invalid payload for ${method}`;
        continue;
      }

      return {
        status: "ok",
        rpc: true,
        lastCheckAt: new Date().toISOString(),
        detail: `${method} returned ${body.result}`,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    status: "fail",
    rpc: false,
    lastCheckAt: new Date().toISOString(),
    detail: lastError,
  };
}

export function summarizeInventory(units: ManagedUnit[]): {
  total: number;
  ok: number;
  warn: number;
  fail: number;
  byLayer: Record<string, number>;
} {
  const summary = {
    total: units.length,
    ok: 0,
    warn: 0,
    fail: 0,
    byLayer: {} as Record<string, number>,
  };

  for (const unit of units) {
    summary.byLayer[unit.layer] = (summary.byLayer[unit.layer] ?? 0) + 1;
    if (unit.health.status === "ok") summary.ok += 1;
    if (unit.health.status === "warn") summary.warn += 1;
    if (unit.health.status === "fail") summary.fail += 1;
  }

  return summary;
}

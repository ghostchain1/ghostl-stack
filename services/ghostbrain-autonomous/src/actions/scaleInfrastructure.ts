/**
 * Scale Infrastructure Action (Phase 49)
 *
 * Evaluates whether the current validator / RPC node count meets the
 * configured redundancy target and forwards a scale proposal to the
 * signing relay for human ratification when it does not.
 *
 * Future scale capabilities (all require human approval):
 *   - launch additional validator VMs via hypervisor
 *   - increase RPC node count
 *   - deploy load balancers across regions
 *
 * No VMs or containers are launched from this module.
 */

import { CONFIG, STRATEGY } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  } else {
    const mod = await import("node-fetch");
    fetchFn = mod.default as unknown as typeof fetch;
  }
  return fetchFn;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ValidatorCount {
  total?:  number;
  active?: number;
  jailed?: number;
}

/**
 * Check whether active validator count meets the redundancy target and
 * return a scale proposal when it falls short.
 *
 * Returns null when no scaling is required.
 */
export async function scaleInfrastructure(): Promise<Proposal | null> {
  const now = new Date().toISOString();

  let active = 0;
  try {
    const f    = await getFetch();
    const r    = await f(`${CONFIG.apiBase}/api/validators`, { signal: AbortSignal.timeout(8_000) });
    const data = await r.json() as ValidatorCount | unknown[];

    if (Array.isArray(data)) {
      active = (data as { status?: string }[]).filter(v => v.status !== "jailed").length;
    } else {
      active = (data as ValidatorCount).active ?? (data as ValidatorCount).total ?? 0;
    }
  } catch (err) {
    console.warn("[scaleInfrastructure] fetch failed:", (err as Error).message);
    return null;
  }

  if (active >= STRATEGY.nodeRedundancy) return null;

  const proposal: Proposal = {
    id:         makeId(),
    type:       "scale_infrastructure",
    kernelType: "vm",
    action:     "start",
    target:     "validator-pool",
    severity:   active === 0 ? "critical" : "warning",
    reason: `Active validator count (${active}) below redundancy target (${STRATEGY.nodeRedundancy})`,
    payload: {
      activeCount:     active,
      redundancyTarget: STRATEGY.nodeRedundancy,
      deficit:          STRATEGY.nodeRedundancy - active,
    },
    createdAt: now,
    status:    "pending",
    source:    "scaleInfrastructure",
  };

  if (CONFIG.dryRun) {
    console.log(`[scaleInfrastructure] DRY_RUN — scale proposal: ${proposal.reason}`);
    return { ...proposal, status: "dry_run" };
  }

  try {
    const f = await getFetch();
    const r = await f(`${CONFIG.signingRelayUrl}/proposals`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...proposal, requestedBy: "ghostbrain-autonomous" }),
      signal:  AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      console.error(`[scaleInfrastructure] relay rejected: ${r.status}`);
      return { ...proposal, status: "send_failed" };
    }

    console.log("[scaleInfrastructure] scale proposal forwarded to signing relay — awaiting human ratification");
    return { ...proposal, status: "sent" };
  } catch (err) {
    console.error(`[scaleInfrastructure] relay unreachable:`, (err as Error).message);
    return { ...proposal, status: "send_failed" };
  }
}

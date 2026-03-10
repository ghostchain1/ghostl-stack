/**
 * Validator Monitor (Phase 43)
 *
 * DETECT-ONLY — never calls write APIs.
 *
 * Fetches the validator list from the GhostStack BFF, inspects each
 * validator's CPU, uptime, and jailed status, and returns a list of
 * Proposals for any anomalies found.
 *
 * The caller (decisionEngine / index.ts) decides whether to forward
 * the proposals to the signing relay.  Nothing is executed here.
 */

import { CONFIG, RULES } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  }
  return fetchFn;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ValidatorRecord {
  name?:    string;
  address?: string;
  cpu?:     number;      // 0–100
  uptime?:  number;      // 0.0–1.0
  jailed?:  boolean;
  status?:  string;
}

/**
 * Inspect all validators and return proposals for any anomalies.
 * Returns an empty array when all validators are healthy.
 */
export async function monitorValidators(): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  const now = new Date().toISOString();

  let validators: ValidatorRecord[] = [];
  try {
    const f  = await getFetch();
    const r  = await f(`${CONFIG.apiBase}/api/validators`, { signal: AbortSignal.timeout(8_000) });
    validators = await r.json() as ValidatorRecord[];
  } catch (err) {
    console.warn("[validatorMonitor] fetch failed:", (err as Error).message);
    return proposals;
  }

  if (!Array.isArray(validators)) return proposals;

  for (const v of validators) {
    const name   = v.name ?? v.address ?? "unknown";
    const cpu    = v.cpu    ?? 0;
    const uptime = v.uptime ?? 1;
    const jailed = v.jailed ?? v.status === "jailed";

    // Jailed validator
    if (jailed) {
      proposals.push({
        id: makeId(), type: "alert_validator_jailed",
        kernelType: "alert", action: "alert", target: name,
        severity: "critical",
        reason: `Validator "${name}" is jailed — immediate governance review required`,
        payload: { validatorName: name, jailed: true },
        createdAt: now, status: "pending", source: "validatorMonitor",
      });
    }

    // Critical CPU
    if (cpu >= RULES.validatorCpuCritical) {
      proposals.push({
        id: makeId(), type: "restart_validator",
        kernelType: "docker", action: "restart", target: name,
        severity: "critical",
        reason: `Validator "${name}" CPU at ${cpu}% ≥ ${RULES.validatorCpuCritical}% threshold`,
        payload: { validatorName: name, cpu, threshold: RULES.validatorCpuCritical },
        createdAt: now, status: "pending", source: "validatorMonitor",
      });
    } else if (cpu >= RULES.validatorCpuWarn) {
      proposals.push({
        id: makeId(), type: "rebalance_validators",
        kernelType: "resource", action: "rebalance", target: name,
        severity: "warning",
        reason: `Validator "${name}" CPU at ${cpu}% ≥ warning threshold ${RULES.validatorCpuWarn}%`,
        payload: { validatorName: name, cpu, threshold: RULES.validatorCpuWarn },
        createdAt: now, status: "pending", source: "validatorMonitor",
      });
    }

    // Low uptime
    if (uptime < RULES.validatorUptimeCritical) {
      proposals.push({
        id: makeId(), type: "restart_validator",
        kernelType: "docker", action: "restart", target: name,
        severity: "critical",
        reason: `Validator "${name}" uptime ${(uptime * 100).toFixed(1)}% < ${(RULES.validatorUptimeCritical * 100).toFixed(0)}% critical threshold`,
        payload: { validatorName: name, uptime },
        createdAt: now, status: "pending", source: "validatorMonitor",
      });
    } else if (uptime < RULES.validatorUptimeWarn) {
      proposals.push({
        id: makeId(), type: "rebalance_validators",
        kernelType: "resource", action: "rebalance", target: name,
        severity: "warning",
        reason: `Validator "${name}" uptime ${(uptime * 100).toFixed(1)}% below warning threshold`,
        payload: { validatorName: name, uptime },
        createdAt: now, status: "pending", source: "validatorMonitor",
      });
    }
  }

  return proposals;
}

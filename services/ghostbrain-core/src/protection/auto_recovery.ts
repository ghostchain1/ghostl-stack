/**
 * GhostBrain — Auto Recovery
 *
 * Executes autonomous recovery actions based on crash predictions and
 * threshold breaches. All destructive actions (VM stop, container kill)
 * require governance ratification unless ALLOW_AUTONOMOUS_DESTRUCTIVE=true.
 *
 * Recovery action ladder (escalating severity):
 *   1. alert         — emit event + log
 *   2. throttle      — reduce container CPU quota
 *   3. scale_memory  — increase container memory limit
 *   4. restart       — restart misbehaving container / service
 *   5. migrate       — move workload to less-loaded node
 *   6. emergency     — stop + redeploy (requires governance)
 */

import { request }             from "undici";
import { canAutoRecover, recordRecovery } from "./stability_guard.js";
import { recordFixResult }     from "../memory/fix_memory.js";

const DOCKER_SOCKET           = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const ALLOW_AUTONOMOUS_DESTR  = process.env.ALLOW_AUTONOMOUS_DESTRUCTIVE === "true";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecoveryActionType =
  | "alert"
  | "throttle"
  | "scale_memory"
  | "restart"
  | "migrate"
  | "emergency";

export interface RecoveryTarget {
  resourceId:  string;
  resourceType: "container" | "vm" | "process" | "chain_node";
  actionType:  RecoveryActionType;
  /** For containers: Docker ID. For VMs: domain name. */
  targetId?:   string;
  params?:     Record<string, number | string | boolean>;
}

export interface RecoveryResult {
  ok:         boolean;
  actionType: RecoveryActionType;
  resourceId: string;
  govRequired: boolean;   // true = blocked — needs governance vote
  detail:     string;
  ts:         number;
}

// ── Docker helpers ────────────────────────────────────────────────────────────

function dockerUrl(path: string): string {
  const base = DOCKER_SOCKET.startsWith("/") ? `unix://${DOCKER_SOCKET}` : DOCKER_SOCKET;
  return `${base}${path}`;
}

async function dockerPost(path: string, body?: unknown): Promise<{ statusCode: number }> {
  const res = await request(dockerUrl(path), {
    method:  "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
    bodyTimeout: 10_000,
  });
  return { statusCode: res.statusCode };
}

// ── Recovery executors ────────────────────────────────────────────────────────

async function doThrottle(target: RecoveryTarget): Promise<RecoveryResult> {
  if (!target.targetId) return { ok: false, actionType: "throttle", resourceId: target.resourceId, govRequired: false, detail: "no targetId", ts: Date.now() };
  const nanoCPU = Number(target.params?.nanoCPU ?? 500_000_000); // 0.5 CPU default
  try {
    const r = await dockerPost(`/containers/${target.targetId}/update`, { NanoCPUs: nanoCPU });
    return { ok: r.statusCode === 200, actionType: "throttle", resourceId: target.resourceId, govRequired: false, detail: `NanoCPUs set to ${nanoCPU}`, ts: Date.now() };
  } catch (e) {
    return { ok: false, actionType: "throttle", resourceId: target.resourceId, govRequired: false, detail: String(e), ts: Date.now() };
  }
}

async function doScaleMemory(target: RecoveryTarget): Promise<RecoveryResult> {
  if (!target.targetId) return { ok: false, actionType: "scale_memory", resourceId: target.resourceId, govRequired: false, detail: "no targetId", ts: Date.now() };
  const memBytes = Number(target.params?.memBytes ?? 1_073_741_824); // 1GB default
  try {
    const r = await dockerPost(`/containers/${target.targetId}/update`, { Memory: memBytes, MemorySwap: memBytes * 2 });
    return { ok: r.statusCode === 200, actionType: "scale_memory", resourceId: target.resourceId, govRequired: false, detail: `Memory set to ${memBytes}`, ts: Date.now() };
  } catch (e) {
    return { ok: false, actionType: "scale_memory", resourceId: target.resourceId, govRequired: false, detail: String(e), ts: Date.now() };
  }
}

async function doRestart(target: RecoveryTarget): Promise<RecoveryResult> {
  if (!target.targetId) return { ok: false, actionType: "restart", resourceId: target.resourceId, govRequired: false, detail: "no targetId", ts: Date.now() };
  try {
    const r = await dockerPost(`/containers/${target.targetId}/restart?t=10`);
    return { ok: r.statusCode === 204, actionType: "restart", resourceId: target.resourceId, govRequired: false, detail: "container restarted", ts: Date.now() };
  } catch (e) {
    return { ok: false, actionType: "restart", resourceId: target.resourceId, govRequired: false, detail: String(e), ts: Date.now() };
  }
}

// ── Main execute ──────────────────────────────────────────────────────────────

/**
 * Execute a recovery action for a resource.
 * Checks quarantine state before acting.
 * Records result in fix_memory.
 */
export async function executeRecovery(target: RecoveryTarget): Promise<RecoveryResult> {
  const now = Date.now();

  // Destructive actions require governance unless explicitly enabled
  if ((target.actionType === "emergency" || target.actionType === "migrate")
    && !ALLOW_AUTONOMOUS_DESTR) {
    return {
      ok: false,
      actionType:  target.actionType,
      resourceId:  target.resourceId,
      govRequired: true,
      detail:      "governance ratification required for destructive action",
      ts:          now,
    };
  }

  // Check quarantine
  if (!canAutoRecover(target.resourceId)) {
    return {
      ok: false,
      actionType:  target.actionType,
      resourceId:  target.resourceId,
      govRequired: false,
      detail:      "resource in quarantine — manual review required",
      ts:          now,
    };
  }

  let result: RecoveryResult;

  switch (target.actionType) {
    case "alert":
      result = { ok: true, actionType: "alert", resourceId: target.resourceId, govRequired: false, detail: "alert emitted", ts: now };
      break;
    case "throttle":
      result = await doThrottle(target);
      break;
    case "scale_memory":
      result = await doScaleMemory(target);
      break;
    case "restart":
      result = await doRestart(target);
      break;
    default:
      result = { ok: false, actionType: target.actionType, resourceId: target.resourceId, govRequired: true, detail: "unimplemented — governance required", ts: now };
  }

  // Learn from outcome
  if (result.ok) {
    recordRecovery(target.resourceId);
    recordFixResult(
      `${target.resourceId}_${target.actionType}_needed`,
      `auto_${target.actionType}`,
      target.actionType,
      target.params ?? {},
      true,
      0,
    );
  }

  return result;
}

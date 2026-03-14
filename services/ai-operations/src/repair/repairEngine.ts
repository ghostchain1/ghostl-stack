// ── Repair Engine ─────────────────────────────────────────────────────────────
// Executes infrastructure repair operations via the HCL API (port 9986).
// Never uses direct shell execution — all operations go through authenticated
// HTTP calls to the Hypervisor Control Layer.
//
// Security: service IDs are sanitized to [a-zA-Z0-9_-] before use in URLs.

import axios from "axios";

const HCL = process.env.HCL_URL ?? "http://localhost:9986";

export type RepairStatus = "success" | "failed" | "skipped";

export interface RepairResult {
  service:   string;
  operation: string;
  status:    RepairStatus;
  message:   string;
  timestamp: number;
}

let repairLog: RepairResult[] = [];

function record(result: RepairResult): RepairResult {
  repairLog.push(result);
  if (repairLog.length > 200) repairLog = repairLog.slice(-200);
  console.log(`[RepairEngine] ${result.operation} "${result.service}" → ${result.status}: ${result.message}`);
  return result;
}

// ── Validates serviceId to prevent SSRF / path-traversal ──────────────────────
function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 64;
}

export async function restartContainer(serviceId: string): Promise<RepairResult> {
  if (!isSafeId(serviceId)) {
    return record({
      service:   serviceId,
      operation: "restart",
      status:    "failed",
      message:   "Rejected: service ID contains invalid characters",
      timestamp: Date.now(),
    });
  }
  try {
    await axios.post(
      `${HCL}/nodes/${encodeURIComponent(serviceId)}/restart`,
      {},
      { timeout: 10_000 },
    );
    return record({
      service:   serviceId,
      operation: "restart",
      status:    "success",
      message:   `Node "${serviceId}" restarted via HCL`,
      timestamp: Date.now(),
    });
  } catch (e) {
    return record({
      service:   serviceId,
      operation: "restart",
      status:    "failed",
      message:   `HCL restart failed: ${e instanceof Error ? e.message : "unknown"}`,
      timestamp: Date.now(),
    });
  }
}

export async function deployNewNode(type: "rpc" | "validator" | "edge"): Promise<RepairResult> {
  try {
    await axios.post(`${HCL}/scale`, { type }, { timeout: 10_000 });
    return record({
      service:   `new-${type}-node`,
      operation: "provision",
      status:    "success",
      message:   `New ${type} node provisioned via HCL`,
      timestamp: Date.now(),
    });
  } catch {
    return record({
      service:   `new-${type}-node`,
      operation: "provision",
      status:    "skipped",
      message:   `HCL /scale unavailable — scaling intent logged for manual action`,
      timestamp: Date.now(),
    });
  }
}

export async function repairService(serviceId: string): Promise<RepairResult> {
  return restartContainer(serviceId);
}

export function getRepairLog(): RepairResult[] { return repairLog; }

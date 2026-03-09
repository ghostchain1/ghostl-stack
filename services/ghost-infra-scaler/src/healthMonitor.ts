/**
 * Health Monitor — queries federation-coordinator periodically,
 * produces ScalingDecision[] for the scaler to act on.
 */
import { fetch } from "undici";
import { type RegionCluster, type ClusterNode } from "ghost-federation-sdk";

const COORDINATOR_URL = process.env.FEDERATION_COORDINATOR_URL ?? "http://localhost:7980";
const HEALTH_INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS ?? 60_000);
const MIN_ONLINE_VALIDATORS = Number(process.env.MIN_ONLINE_VALIDATORS ?? 3);
const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_MS ?? 120_000);
const FETCH_TIMEOUT_MS = 8_000;

export type ScalingAction = "deploy-node" | "restart-node" | "scale-service" | "rebalance";

export interface ScalingDecision {
  id: string;
  action: ScalingAction;
  region: string;
  nodeId?: string;
  role?: string;
  reason: string;
  createdAt: number;
  dryRun: boolean;
  humanApprovalRequired: boolean;
  executed: boolean;
}

let monitorTimer: NodeJS.Timeout | null = null;
const decisions: ScalingDecision[] = [];

function makeDecisionId(): string {
  return `sd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchClusters(): Promise<RegionCluster[]> {
  try {
    const res = await fetch(`${COORDINATOR_URL}/clusters`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return (await res.json()) as RegionCluster[];
  } catch {
    return [];
  }
}

function analyzeCluster(cluster: RegionCluster): ScalingDecision[] {
  const result: ScalingDecision[] = [];
  const now = Date.now();

  // Degraded cluster → deploy additional validator nodes
  if (cluster.status === "degraded" || cluster.status === "offline") {
    const onlineValidators = cluster.nodes.filter(
      (n) => n.role === "validator" && n.online
    ).length;
    if (onlineValidators < MIN_ONLINE_VALIDATORS) {
      result.push({
        id: makeDecisionId(),
        action: "deploy-node",
        region: cluster.region,
        role: "validator",
        reason: `Only ${onlineValidators}/${MIN_ONLINE_VALIDATORS} validators online in ${cluster.region} (status: ${cluster.status})`,
        createdAt: now,
        dryRun: true,
        humanApprovalRequired: true,
        executed: false,
      });
    }
  }

  // Offline nodes that haven't been seen recently → restart
  const staleOffline = cluster.nodes.filter(
    (n) => !n.online && now - n.lastSeen > OFFLINE_THRESHOLD_MS
  );
  for (const node of staleOffline) {
    result.push({
      id: makeDecisionId(),
      action: "restart-node",
      region: cluster.region,
      nodeId: node.id,
      reason: `Node ${node.id} offline for > ${OFFLINE_THRESHOLD_MS / 1000}s`,
      createdAt: now,
      dryRun: true,
      humanApprovalRequired: false,
      executed: false,
    });
  }

  return result;
}

export async function runHealthAnalysis(): Promise<ScalingDecision[]> {
  const clusters = await fetchClusters();
  const newDecisions: ScalingDecision[] = [];
  for (const cluster of clusters) {
    newDecisions.push(...analyzeCluster(cluster));
  }
  decisions.push(...newDecisions);
  // Cap history at 1000
  if (decisions.length > 1000) decisions.splice(0, decisions.length - 1000);
  return newDecisions;
}

export function startMonitoring(): void {
  if (monitorTimer) return;
  void runHealthAnalysis(); // immediate
  monitorTimer = setInterval(() => void runHealthAnalysis(), HEALTH_INTERVAL_MS);
}

export function stopMonitoring(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

export function getPendingDecisions(): ScalingDecision[] {
  return decisions.filter((d) => !d.executed);
}

export function getAllDecisions(): ScalingDecision[] {
  return [...decisions];
}

export function markExecuted(id: string): boolean {
  const d = decisions.find((dec) => dec.id === id);
  if (!d) return false;
  d.executed = true;
  return true;
}

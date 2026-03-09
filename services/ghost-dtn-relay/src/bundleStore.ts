/**
 * GDTP Bundle Store
 * In-memory store for GDTP bundles with TTL expiry.
 */
import {
  type GDTPBundle,
  type BundleStatus,
  type NodeEnvironment,
  BUNDLE_TTL_MS,
} from "ghost-interplanetary-sdk";
import { randomUUID } from "node:crypto";

const store = new Map<string, GDTPBundle>();
const EXPIRY_INTERVAL_MS = 60_000;

export function storeBundle(bundle: GDTPBundle): void {
  store.set(bundle.id, bundle);
}

export function getBundle(id: string): GDTPBundle | undefined {
  return store.get(id);
}

export function getAllBundles(): GDTPBundle[] {
  return [...store.values()];
}

export function getPending(): GDTPBundle[] {
  return [...store.values()].filter((b) => b.status === "pending");
}

export function getByDestination(destNodeId: string): GDTPBundle[] {
  return [...store.values()].filter(
    (b) => b.destNodeId === destNodeId && b.status === "pending"
  );
}

export function updateStatus(id: string, status: BundleStatus): boolean {
  const b = store.get(id);
  if (!b) return false;
  b.status = status;
  return true;
}

export function addHop(id: string, nodeId: string): boolean {
  const b = store.get(id);
  if (!b) return false;
  b.hopCount += 1;
  b.route.push(nodeId);
  return true;
}

export function createBundle(params: {
  sourceNodeId: string;
  destNodeId: string;
  priority: number;
  txCount: number;
  merkleRoot: string;
  zkProofHash: string;
  payloadHash: string;
  compressedBytes: number;
  environment: NodeEnvironment;
}): GDTPBundle {
  const ttlMs = BUNDLE_TTL_MS[params.environment];
  const now = Date.now();
  const bundle: GDTPBundle = {
    id: randomUUID(),
    sourceNodeId: params.sourceNodeId,
    destNodeId: params.destNodeId,
    priority: params.priority,
    ttlMs,
    txCount: params.txCount,
    merkleRoot: params.merkleRoot,
    zkProofHash: params.zkProofHash,
    payloadHash: params.payloadHash,
    compressedBytes: params.compressedBytes,
    createdAt: now,
    expiresAt: now + ttlMs,
    status: "pending",
    hopCount: 0,
    route: [params.sourceNodeId],
  };
  store.set(bundle.id, bundle);
  return bundle;
}

// Periodic expiry sweep
export function startExpiryLoop(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [id, bundle] of store.entries()) {
      if (bundle.status === "pending" && now > bundle.expiresAt) {
        bundle.status = "expired";
        store.set(id, bundle);
      }
    }
  }, EXPIRY_INTERVAL_MS);
}

export function stats(): { total: number; pending: number; inTransit: number; delivered: number; expired: number; failed: number } {
  const all = [...store.values()];
  return {
    total:     all.length,
    pending:   all.filter((b) => b.status === "pending").length,
    inTransit: all.filter((b) => b.status === "in-transit").length,
    delivered: all.filter((b) => b.status === "delivered").length,
    expired:   all.filter((b) => b.status === "expired").length,
    failed:    all.filter((b) => b.status === "failed").length,
  };
}

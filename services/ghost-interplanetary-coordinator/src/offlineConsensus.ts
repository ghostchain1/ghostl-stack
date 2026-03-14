/**
 * Offline Consensus Zone Manager
 * Tracks isolated network partitions and their local consensus state.
 */
import {
  type OfflineConsensusZone,
  type NodeEnvironment,
  type ZoneStatus,
} from "ghost-interplanetary-sdk";
import { getAllNodes } from "./nodeRegistry.js";
import { randomUUID } from "node:crypto";

const zones = new Map<string, OfflineConsensusZone>();

const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_MS ?? 120_000);

export function createZone(
  environment: NodeEnvironment,
  nodeIds: string[],
  earthBlockHeight: number
): OfflineConsensusZone {
  const zone: OfflineConsensusZone = {
    id: randomUUID(),
    environment,
    nodeIds,
    status: "isolated",
    localBlockHeight: 0,
    earthBlockHeightAtDisconnect: earthBlockHeight,
    disconnectedAt: Date.now(),
    pendingBundleCount: 0,
    pendingVotes: 0,
  };
  zones.set(zone.id, zone);
  return zone;
}

export function getZone(id: string): OfflineConsensusZone | undefined {
  return zones.get(id);
}

export function getAllZones(): OfflineConsensusZone[] {
  return [...zones.values()];
}

export function getActiveZones(): OfflineConsensusZone[] {
  return [...zones.values()].filter((z) => z.status !== "connected");
}

export function updateZoneStatus(id: string, status: ZoneStatus): boolean {
  const z = zones.get(id);
  if (!z) return false;
  z.status = status;
  if (status === "connected") z.reconnectedAt = Date.now();
  zones.set(id, z);
  return true;
}

export function updateZoneBlockHeight(id: string, height: number): boolean {
  const z = zones.get(id);
  if (!z) return false;
  z.localBlockHeight = height;
  return true;
}

export function incrementPendingVotes(id: string): void {
  const z = zones.get(id);
  if (z) z.pendingVotes += 1;
}

/**
 * Scan node registry for nodes that have been offline long enough
 * to constitute an isolated consensus zone. Creates zones automatically.
 */
export function detectPartitions(earthBlockHeight: number): OfflineConsensusZone[] {
  const allNodes = getAllNodes();
  const now = Date.now();

  // Group offline nodes by environment
  const offlineByEnv = new Map<NodeEnvironment, string[]>();
  for (const node of allNodes) {
    if (!node.online && now - node.lastContact > OFFLINE_THRESHOLD_MS) {
      const env = node.environment;
      const existing = offlineByEnv.get(env) ?? [];
      existing.push(node.id);
      offlineByEnv.set(env, existing);
    }
  }

  const newZones: OfflineConsensusZone[] = [];
  for (const [env, nodeIds] of offlineByEnv.entries()) {
    // Don't create duplicate zones for same environment
    const existingZone = [...zones.values()].find(
      (z) => z.environment === env && z.status === "isolated"
    );
    if (existingZone) continue;
    newZones.push(createZone(env, nodeIds, earthBlockHeight));
  }
  return newZones;
}

/**
 * Trigger sync for a zone — set status to "syncing".
 * The actual sync is driven by the DTN relay delivering pending bundles.
 */
export function triggerSync(zoneId: string): boolean {
  return updateZoneStatus(zoneId, "syncing");
}

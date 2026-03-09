/**
 * Failover orchestration — detects degraded clusters and routes
 * GIP failover-request messages to backup coordinators.
 */
import {
  type FederationRegion,
  type RegionCluster,
  REPUTATION_THRESHOLDS,
} from "ghost-federation-sdk";
import { gipRelay } from "./gipRelay.js";
import { regionRegistry } from "./regionRegistry.js";
import { randomUUID } from "node:crypto";

// Preferred backup region per primary region
const FAILOVER_MAP: Record<FederationRegion, FederationRegion> = {
  NA: "EU",
  EU: "NA",
  AS: "OC",
  SA: "NA",
  AF: "EU",
  OC: "AS",
};

interface ActiveFailover {
  id: string;
  failedRegion: FederationRegion;
  backupRegion: FederationRegion;
  initiatedAt: number;
  ackReceived: boolean;
  resolvedAt?: number;
}

class FailoverOrchestrator {
  private active = new Map<FederationRegion, ActiveFailover>();

  detectAndHandle(cluster: RegionCluster): void {
    const { region, status } = cluster;
    if (status !== "offline") {
      // Resolve any active failover if cluster recovered
      const existing = this.active.get(region);
      if (existing && !existing.resolvedAt) {
        existing.resolvedAt = Date.now();
      }
      return;
    }
    // Don't double-initiate
    if (this.active.has(region)) return;

    const backupRegion = FAILOVER_MAP[region];
    void this.initiateFailover(region, backupRegion);
  }

  private async initiateFailover(
    failedRegion: FederationRegion,
    backupRegion: FederationRegion
  ): Promise<void> {
    const id = randomUUID();
    const failover: ActiveFailover = {
      id,
      failedRegion,
      backupRegion,
      initiatedAt: Date.now(),
      ackReceived: false,
    };
    this.active.set(failedRegion, failover);

    await gipRelay.relay({
      id,
      type: "failover-request",
      sourceRegion: failedRegion,
      targetRegion: backupRegion,
      payload: {
        failedRegion,
        backupRegion,
        clustersAtFailover: regionRegistry.getAllClusters().filter((c) => c.region === failedRegion),
      },
      timestamp: Date.now(),
      ttlMs: 300_000, // 5 min
    });
  }

  ackFailover(failoverId: string): void {
    for (const fo of this.active.values()) {
      if (fo.id === failoverId) {
        fo.ackReceived = true;
        return;
      }
    }
  }

  getActive(): ActiveFailover[] {
    return [...this.active.values()].filter((f) => !f.resolvedAt);
  }

  getAllFailovers(): ActiveFailover[] {
    return [...this.active.values()];
  }
}

export const failoverOrchestrator = new FailoverOrchestrator();

/**
 * GhostBrain Global Orchestrator — Cross-Region Consensus Monitor
 *
 * Polls each region's GhostChain nodes to detect:
 *   - Block-height divergence between regions on the same layer.
 *   - Settlement lag (L2 behind L1 or L3 behind L2).
 *
 * Chain topology enforced:
 *   L1 chain_id=14000101  GhostChain sovereign chain  port 18545
 *   L2 chain_id=901       GhostL2 OP Stack            port 29545
 *   L3 chain_id=903       GhostL3 OP Stack            port 39545
 *
 * Settlement order: L3 → L2 → L1.  L3 lag is measured against L2;
 * L2 lag is measured against L1.  Neither contacts external chains.
 *
 * INVARIANTS
 * ----------
 * - Read-only: never submits transactions or state-changing calls.
 * - Governance alert POSTed to signing relay when a region diverges.
 * - fetch() with AbortController on every network call.
 */

import { randomUUID } from "crypto";
import type { RegionInfo, CrossRegionState, ConsensusState } from "../types.js";
import type { RegionIndex } from "../discovery/region_index.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SIGNING_RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

/** Block-height difference that triggers "lagging" state. */
const LAG_THRESHOLD_BLOCKS = parseInt(
  process.env["CONSENSUS_LAG_THRESHOLD"] ?? "10", 10,
);
/** Block-height difference that triggers "diverged" state. */
const DIVERGE_THRESHOLD_BLOCKS = parseInt(
  process.env["CONSENSUS_DIVERGE_THRESHOLD"] ?? "50", 10,
);

const RPC_TIMEOUT_MS = parseInt(
  process.env["CONSENSUS_RPC_TIMEOUT_MS"] ?? "5000", 10,
);

const RELAY_TIMEOUT_MS = parseInt(
  process.env["CONSENSUS_RELAY_TIMEOUT_MS"] ?? "8000", 10,
);

// Layer port map: standard GhostChain RPC ports.
const LAYER_PORTS: Record<string, number> = {
  l1: 18545,
  l2: 29545,
  l3: 39545,
};

// ---------------------------------------------------------------------------
// CrossRegionConsensus
// ---------------------------------------------------------------------------

export class CrossRegionConsensus {
  constructor(private readonly regionIndex: RegionIndex) {}

  /**
   * Poll every registered region and return per-region consensus state.
   * Never throws — individual failures are encoded as "unknown" state.
   */
  async check(): Promise<CrossRegionState[]> {
    const regions = this.regionIndex.rankedRegions();
    const results = await Promise.allSettled(
      regions.map(r => this.checkRegion(r)),
    );

    const states: CrossRegionState[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === "fulfilled") {
        states.push(r.value);
      } else {
        states.push(unknownState(regions[i]!.id));
      }
    }

    // Alert relay for diverged regions.
    const diverged = states.filter(s => s.state === "diverged");
    if (diverged.length > 0) {
      await this.alertRelay(diverged).catch(() => void 0);
    }

    return states;
  }

  // -------------------------------------------------------------------------
  // Per-region check
  // -------------------------------------------------------------------------

  private async checkRegion(region: RegionInfo): Promise<CrossRegionState> {
    const now = Date.now();

    const [l1, l2, l3] = await Promise.all([
      this.getBlockHeight(region.primaryL1Host, LAYER_PORTS["l1"]!),
      this.getBlockHeight(region.primaryL2Host, LAYER_PORTS["l2"]!),
      this.getBlockHeight(region.primaryL3Host, LAYER_PORTS["l3"]!),
    ]);

    if (l1 === null || l2 === null || l3 === null) {
      return unknownState(region.id);
    }

    // Settlement lag: L2 behind L1 (L2 settles to L1).
    const l2LagBlocks = Math.max(0, l1 - l2);
    // Settlement lag: L3 behind L2 (L3 settles to L2).
    const l3LagBlocks = Math.max(0, l2 - l3);

    const maxLag = Math.max(l2LagBlocks, l3LagBlocks);
    const state: ConsensusState =
      maxLag >= DIVERGE_THRESHOLD_BLOCKS ? "diverged"
      : maxLag >= LAG_THRESHOLD_BLOCKS   ? "lagging"
      : "synchronized";

    return {
      regionId:      region.id,
      l1BlockHeight: l1,
      l2BlockHeight: l2,
      l3BlockHeight: l3,
      l2LagBlocks,
      l3LagBlocks,
      state,
      checkedAt:     now,
    };
  }

  // -------------------------------------------------------------------------
  // Block height query — ghost_getBlockByNumber (read-only)
  // -------------------------------------------------------------------------

  private async getBlockHeight(
    host: string,
    port: number,
  ): Promise<number | null> {
    if (!host || port === 0) return null;

    const url = `http://${host}:${port}`;
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), RPC_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method:  "POST",
        signal:  ctl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id:      1,
          method:  "ghost_getBlockByNumber",
          params:  ["latest", false],
        }),
      });
      clearTimeout(tid);

      if (!res.ok) return null;

      const data = await res.json() as {
        result?: { number?: string } | null;
        error?: unknown;
      };
      if (data.error || !data.result?.number) return null;

      const height = parseInt(data.result.number, 16);
      return Number.isFinite(height) ? height : null;
    } catch {
      clearTimeout(tid);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Relay alert — non-autonomous advisory only
  // -------------------------------------------------------------------------

  private async alertRelay(diverged: CrossRegionState[]): Promise<void> {
    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), RELAY_TIMEOUT_MS);

    try {
      await fetch(`${SIGNING_RELAY_URL}/relay/consensus/alert`, {
        method:  "POST",
        signal:  ctl.signal,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          proposal_id: randomUUID(),
          alert_type:  "cross_region_divergence",
          chain_id:    14000101,
          gas_token:   "GST",
          from:        "ghostbrain-consensus",
          diverged_regions: diverged.map(s => ({
            region_id:     s.regionId,
            l2_lag_blocks: s.l2LagBlocks,
            l3_lag_blocks: s.l3LagBlocks,
          })),
        }),
      });
      clearTimeout(tid);
    } catch {
      clearTimeout(tid);
      // Non-fatal — alert is advisory.
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unknownState(regionId: string): CrossRegionState {
  return {
    regionId,
    l1BlockHeight: 0,
    l2BlockHeight: 0,
    l3BlockHeight: 0,
    l2LagBlocks:   0,
    l3LagBlocks:   0,
    state:         "unknown",
    checkedAt:     Date.now(),
  };
}

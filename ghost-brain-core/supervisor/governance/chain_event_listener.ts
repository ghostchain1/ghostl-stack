/**
 * Chain Event Listener
 *
 * Polls GhostChain L1 / GhostL2 / GhostL3 for governance events relevant
 * to the infrastructure supervisor. Updates L2 block lag and surfaces
 * on-chain governance decisions as local events.
 *
 * Security:
 * - Uses ghost_getBlockByNumber / ghost_getLogs exclusively (NOT eth_call).
 * - No legacy compatibility SDK dependency — raw JSON-RPC via fetch.
 * - Read-only — never submits transactions.
 */

import type { IController } from "../brain/supervisor_core.js";

// ---------------------------------------------------------------------------
// RPC helper
// ---------------------------------------------------------------------------

async function ghostCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);

  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result as T;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const L1_RPC = process.env["GHOSTCHAIN_L1_RPC"] ?? "http://localhost:18545";
const L2_RPC = process.env["GHOSTL2_RPC"]       ?? "http://localhost:7260";
const L3_RPC = process.env["GHOSTL3_RPC"]       ?? "http://localhost:7270";

/** L1 finality oracle — used to derive L2 block lag baseline. */
const FINALITY_ORACLE_L1 = process.env["FINALITY_ORACLE_L1"]
  ?? "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422";

/** L1 rollup contract — tracks submitted L2 block number. */
const L1_ROLLUP_ADDR = process.env["L1_ROLLUP_ADDR"]
  ?? "0xad32D5C2Da9f4159C4cc98686C005852b3905355";

/** Finality oracle on L2. */
const FINALITY_ORACLE_L2 = process.env["FINALITY_ORACLE_L2"]
  ?? "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainEventListenerCallbacks {
  onL2BlockLag(lag: number): void;
  onGovernanceEvent(event: GovernanceChainEvent): void;
}

export interface GovernanceChainEvent {
  kind:    "proposal_created" | "proposal_executed" | "supervisory_action";
  txHash:  string;
  blockNumber: number;
  chainId: number;
  raw:     string;
}

// ---------------------------------------------------------------------------
// Event topic hashes
// ---------------------------------------------------------------------------

const TOPICS: Record<string, GovernanceChainEvent["kind"]> = {
  "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0": "proposal_created",
  "0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f": "proposal_executed",
  "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4": "supervisory_action",
};

// ---------------------------------------------------------------------------
// ChainEventListener
// ---------------------------------------------------------------------------

export class ChainEventListener implements IController {
  readonly name = "ChainEventListener";

  private readonly callbacks: ChainEventListenerCallbacks;
  private lastL1Block = 0;
  private lastL2Block = 0;

  constructor(callbacks: ChainEventListenerCallbacks) {
    this.callbacks = callbacks;
  }

  async check(): Promise<void> {
    await Promise.allSettled([
      this.measureL2Lag(),
      this.pollGovernanceEvents(),
    ]);
  }

  // ---------------------------------------------------------------------------
  // L2 lag measurement
  // ---------------------------------------------------------------------------

  private async measureL2Lag(): Promise<void> {
    try {
      // Get latest L2 block.
      const l2Block = await ghostCall<{ number: string }>(
        L2_RPC, "ghost_getBlockByNumber", ["latest", false]
      );
      const l2Num = parseInt(l2Block.number, 16);

      // Get last L2 block submitted to L1 via rollup contract
      // selector: getLastSubmittedL2Block() = 5fc6e1ed
      const l1SubmittedHex = await ghostCall<string>(
        L1_RPC, "ghost_call",
        [{ to: L1_ROLLUP_ADDR, data: "0x5fc6e1ed" }, "latest"]
      );
      const l1Submitted = parseInt(l1SubmittedHex, 16);

      const lag = Math.max(0, l2Num - l1Submitted);
      this.lastL1Block = l1Submitted;
      this.lastL2Block = l2Num;

      this.callbacks.onL2BlockLag(lag);
    } catch (err) {
      console.warn("[ChainEventListener] L2 lag measurement failed:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Governance event polling
  // ---------------------------------------------------------------------------

  private async pollGovernanceEvents(): Promise<void> {
    if (this.lastL1Block === 0) return;

    const fromBlock = `0x${(this.lastL1Block - 100).toString(16)}`;
    const toBlock   = "latest";

    try {
      const logs = await ghostCall<Array<{
        topics: string[];
        transactionHash: string;
        blockNumber: string;
        data: string;
      }>>(
        L1_RPC,
        "ghost_getLogs",
        [{
          address:   FINALITY_ORACLE_L1,
          fromBlock,
          toBlock,
          topics:    [Object.keys(TOPICS)],
        }]
      );

      for (const log of logs) {
        const topic = log.topics[0] ?? "";
        const kind  = TOPICS[topic];
        if (!kind) continue;

        const event: GovernanceChainEvent = {
          kind,
          txHash:      log.transactionHash,
          blockNumber: parseInt(log.blockNumber, 16),
          chainId:     14000101,
          raw:         log.data,
        };

        console.log(`[ChainEventListener] Governance event: ${kind} at block ${event.blockNumber}`);
        this.callbacks.onGovernanceEvent(event);
      }
    } catch (err) {
      console.warn("[ChainEventListener] Governance event poll failed:", err);
    }
  }
}

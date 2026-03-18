/**
 * GhostBrain Swarm — Treasury AI
 *
 * Monitors GhostChain L1 and L2 economic health by querying chain state
 * directly via ghost_getBlockByNumber and ghost_call RPC methods.
 * Uses ghost_* namespace exclusively — never eth_*.
 *
 * L1 chain_id: 14000101  (GhostChain)
 * L2 chain_id: 901       (GhostL2)
 * gas_token:   GST
 *
 * Responsibilities:
 *   - Detect L2 block lag (batcher health).
 *   - Check L1 latest block freshness (L1 node liveness).
 *   - Identify abnormal L2/L3 block production gaps.
 *   - Publish treasury:chain_alert when anomalies are detected.
 *   - Recommend governance proposals for sustained chain health issues.
 *
 * Never submits transactions. All proposals route through the signing relay.
 */

import type { ISwarmAgent, SwarmContext, AgentReport, AgentRecommendation } from "../coordination/agent_interface.js";

// ---------------------------------------------------------------------------
// Configuration — all chain constants from GhostBrand
// ---------------------------------------------------------------------------

const L1_RPC = process.env["GHOSTCHAIN_L1_RPC"] ?? "http://localhost:18545";
const L2_RPC = process.env["GHOSTL2_RPC"]       ?? "http://localhost:29545";
const L3_RPC = process.env["GHOSTL3_RPC"]       ?? "http://localhost:39545";

const L1_ROLLUP_ADDR     = "0xad32D5C2Da9f4159C4cc98686C005852b3905355";
const L2_LAG_THRESHOLD   = parseInt(process.env["TREASURY_L2_LAG_BLOCKS"] ?? "500",  10);
const L3_LAG_THRESHOLD   = parseInt(process.env["TREASURY_L3_LAG_BLOCKS"] ?? "200",  10);
const L1_STALE_SECS      = parseInt(process.env["TREASURY_L1_STALE_SECS"] ?? "60",   10);
/** Sustained anomaly ticks before proposing governance action. */
const SUSTAINED_THRESHOLD = parseInt(process.env["TREASURY_SUSTAINED_TICKS"] ?? "3", 10);

// Selector for latestConfirmedBlock() on L1Rollup (keccak256 first 4 bytes).
const LATEST_CONFIRMED_SELECTOR = "5fc6e1ed";

// Sustained state.
let sustainedAnomalyTicks = 0;

// ---------------------------------------------------------------------------
// TreasuryAI
// ---------------------------------------------------------------------------

export class TreasuryAI implements ISwarmAgent {
  readonly name = "treasury_ai";
  readonly role = "treasury" as const;

  async act(ctx: SwarmContext): Promise<AgentReport> {
    const t0 = Date.now();
    const recommendations: AgentRecommendation[] = [];
    let anomalyDetected = false;

    try {
      // Query L1 and L2 block numbers in parallel.
      const [l1Result, l2Result, l3Result, l1CommittedResult] = await Promise.allSettled([
        ghostGetBlockNumber(L1_RPC),
        ghostGetBlockNumber(L2_RPC),
        ghostGetBlockNumber(L3_RPC),
        ghostCall<string>(L1_RPC, L1_ROLLUP_ADDR, LATEST_CONFIRMED_SELECTOR),
      ]);

      const l1Block        = l1Result.status  === "fulfilled" ? l1Result.value  : null;
      const l2Block        = l2Result.status  === "fulfilled" ? l2Result.value  : null;
      const l3Block        = l3Result.status  === "fulfilled" ? l3Result.value  : null;
      const l1Committed    = l1CommittedResult.status === "fulfilled" ? l1CommittedResult.value : null;

      // 1 — L1 liveness check.
      if (l1Block === null) {
        anomalyDetected = true;
        ctx.bus.publish("treasury:chain_alert", this.name, {
          chainId: 14000101,
          kind:    "l1_unreachable",
          message: "GhostChain L1 RPC did not respond",
        });
        recommendations.push({
          kind:        "governance_propose",
          confidence:  0.9,
          priority:    95,
          description: "Treasury AI: GhostChain L1 is unreachable — immediate human review required",
        });
      }

      // Record L2 lag.
      if (l2Block !== null && l1Committed !== null) {
        const committed = parseInt(l1Committed, 16);
        if (!isNaN(committed)) {
          const lag = l2Block - committed;
          ctx.memory.record("l2_lag", this.name, {
            lagBlocks:        lag,
            l2Block,
            l1CommittedBlock: committed,
            threshold:        L2_LAG_THRESHOLD,
          });
          if (lag > L2_LAG_THRESHOLD) {
            anomalyDetected = true;
            ctx.bus.publish("treasury:chain_alert", this.name, {
              chainId:   901,
              kind:      "l2_lag",
              lagBlocks: lag,
              message:   `L2 lag ${lag} blocks exceeds threshold ${L2_LAG_THRESHOLD}`,
            });
            recommendations.push({
              kind:        "inspect_source",
              target:      "ghost-rollup-batcher",
              confidence:  Math.min(lag / (L2_LAG_THRESHOLD * 2), 0.9),
              priority:    80,
              description: `Treasury AI: L2 block lag ${lag} blocks — check batcher health`,
            });
          }
        }
      }

      // L3 lag vs L2.
      if (l3Block !== null && l2Block !== null) {
        const l3Lag = l2Block - l3Block;
        if (l3Lag > L3_LAG_THRESHOLD) {
          anomalyDetected = true;
          ctx.bus.publish("treasury:chain_alert", this.name, {
            chainId:   903,
            kind:      "l2_lag",
            lagBlocks: l3Lag,
            message:   `L3 lag ${l3Lag} blocks behind L2 — threshold ${L3_LAG_THRESHOLD}`,
          });
          recommendations.push({
            kind:        "inspect_source",
            target:      "ghostl3-sequencer",
            confidence:  Math.min(l3Lag / (L3_LAG_THRESHOLD * 2), 0.85),
            priority:    70,
            description: `Treasury AI: L3 lag ${l3Lag} blocks behind L2`,
          });
        }
      }

      // Sustained anomaly → governance proposal.
      if (anomalyDetected) {
        sustainedAnomalyTicks++;
      } else {
        sustainedAnomalyTicks = 0;
      }
      if (sustainedAnomalyTicks >= SUSTAINED_THRESHOLD) {
        recommendations.push({
          kind:        "governance_propose",
          confidence:  Math.min(0.6 + sustainedAnomalyTicks * 0.05, 0.95),
          priority:    90,
          description:
            `Treasury AI: chain anomaly sustained for ${sustainedAnomalyTicks} ticks — ` +
            `propose human review via governance (gas_token: GST, chain_id: 14000101)`,
        });
        sustainedAnomalyTicks = 0; // Reset after proposal.
      }

      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         true,
        durationMs:      Date.now() - t0,
        recommendations,
        summary:
          `L1=${l1Block ?? "err"} L2=${l2Block ?? "err"} L3=${l3Block ?? "err"}` +
          ` sustainedAnomalyTicks=${sustainedAnomalyTicks}`,
      };
    } catch (err) {
      return {
        agentName:       this.name,
        role:            this.role,
        healthy:         false,
        durationMs:      Date.now() - t0,
        recommendations: [],
        summary:         err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Inline ghost_* RPC helpers (no legacy compatibility SDK)
// ---------------------------------------------------------------------------

async function ghostRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const { request } = await import("http");

  return new Promise<T>((resolve, reject) => {
    const body    = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const url     = new URL(rpcUrl);
    const timeout = setTimeout(() => reject(new Error("rpc timeout")), 5_000);
    const req = request(
      {
        hostname: url.hostname,
        port:     url.port || "80",
        path:     url.pathname,
        method:   "POST",
        headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      res => {
        clearTimeout(timeout);
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", c => { raw += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw) as { result?: T; error?: { message: string } };
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed.result as T);
          } catch (e) { reject(e); }
        });
      },
    );
    req.on("error", e => { clearTimeout(timeout); reject(e); });
    req.setTimeout(5_000, () => { req.destroy(); reject(new Error("rpc timeout")); });
    req.write(body);
    req.end();
  });
}

async function ghostGetBlockNumber(rpcUrl: string): Promise<number> {
  const hex = await ghostRpc<string>(rpcUrl, "ghost_getBlockByNumber", ["latest", false]);
  // ghost_getBlockByNumber returns a block object with .number in hex.
  const asBlock = hex as unknown as { number?: string };
  const num = asBlock.number ? parseInt(asBlock.number, 16) : NaN;
  if (isNaN(num)) throw new Error(`Failed to parse block number from ${rpcUrl}`);
  return num;
}

async function ghostCall<T = string>(rpcUrl: string, to: string, selector: string): Promise<T> {
  return ghostRpc<T>(rpcUrl, "ghost_call", [{ to, data: `0x${selector}` }, "latest"]);
}

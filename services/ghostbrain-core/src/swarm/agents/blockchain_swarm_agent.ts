/**
 * GhostBrain Swarm — Blockchain Swarm Agent  (domain: blockchain)
 *
 * Handles blockchain-layer tasks: validator downtime, missed blocks, chain
 * desync, jailed validators.
 *
 * Governance rule (AGENTS.md §7):
 *   AI may DRAFT proposals; humans must RATIFY via governance quorum.
 *   All actions are forwarded to the signing relay at http://localhost:7910
 *   — never executed autonomously on-chain.
 */

import { request }     from "undici";
import { store_event } from "../../memory_engine.js";
import { log }         from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

const SIGNING_RELAY = process.env.SIGNING_RELAY_URL ?? "http://localhost:7910";

export class BlockchainSwarmAgent implements SwarmAgent {
  readonly name   = "BlockchainSwarmAgent";
  readonly domain = "blockchain" as const;

  private _handled = 0;
  private _drafted = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "blockchain" ||
      /validator_issue|chain_desync|missed_blocks|jailed_validator/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(
      task.data.resourceId ?? task.data.operatorAddress ?? "unknown"
    );

    const proposal = {
      kind:       task.type,
      resourceId,
      rationale:  `Swarm BlockchainAgent: ${task.type} on ${resourceId}`,
      draftedAt:  Date.now(),
      draftedBy:  "BlockchainSwarmAgent",
      status:     "pending_ratification",
      context:    task.data,
    };

    // Record in memory regardless of relay availability
    store_event({
      category:   "blockchain",
      label:      "swarm_blockchain_proposal",
      resourceId,
      layer:      "blockchain",
      severity:   "warning",
      payload:    proposal,
    });

    // Forward proposal to signing relay for human ratification
    let ok     = false;
    let detail = "";
    try {
      const res = await request(SIGNING_RELAY + "/proposals", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(proposal),
        bodyTimeout: 8_000,
      });
      ok     = res.statusCode < 300;
      detail = ok
        ? `proposal forwarded to signing relay (${res.statusCode})`
        : `signing relay returned ${res.statusCode}`;
    } catch (err) {
      detail = `signing relay unreachable — proposal stored in memory: ${String(err)}`;
      ok     = true;  // memory record counts as success; relay may be down
    }

    if (ok) this._drafted++;
    log.info("blockchain_swarm_agent: execute", `type=${task.type} resource=${resourceId}`);

    return {
      taskId:     task.id,
      agentName:  this.name,
      domain:     this.domain,
      ok,
      detail,
      executedAt: start,
      durationMs: Date.now() - start,
    };
  }

  stats(): Record<string, unknown> {
    return { handled: this._handled, drafted: this._drafted };
  }
}

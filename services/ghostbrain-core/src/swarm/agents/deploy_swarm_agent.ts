/**
 * GhostBrain Swarm — Deploy Swarm Agent  (domain: devops)
 *
 * Handles DevOps tasks: smart contract deployments, service upgrades, CI
 * triggers, rollback requests.
 *
 * Governance rule (AGENTS.md §7):
 *   AI may DRAFT deployment proposals; humans must RATIFY them.
 *   All proposals are forwarded to the signing relay — no autonomous deploy.
 */

import { request }     from "undici";
import { store_event } from "../../memory_engine.js";
import { log }         from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

const SIGNING_RELAY = process.env.SIGNING_RELAY_URL ?? "http://localhost:7910";

export class DeploySwarmAgent implements SwarmAgent {
  readonly name   = "DeploySwarmAgent";
  readonly domain = "devops" as const;

  private _handled = 0;
  private _drafted = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "devops" ||
      /deploy_request|upgrade_needed|contract_deploy|ci_trigger/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(task.data.resourceId ?? task.data.service ?? "unknown");

    const proposal = {
      kind:       "deployment",
      subtype:    task.type,
      resourceId,
      params:     task.data,
      rationale:  `Swarm DeployAgent: ${task.type} on ${resourceId}`,
      draftedAt:  Date.now(),
      draftedBy:  "DeploySwarmAgent",
      status:     "pending_ratification",
    };

    store_event({
      category:   "devops",
      label:      "swarm_deploy_proposal",
      resourceId,
      layer:      "devops",
      severity:   "info",
      payload:    proposal,
    });

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
        ? `deploy proposal forwarded to signing relay (${res.statusCode})`
        : `signing relay returned ${res.statusCode}`;
    } catch (err) {
      detail = `signing relay unreachable: ${String(err)}`;
    }

    if (ok) this._drafted++;
    log.info("deploy_swarm_agent: execute", `type=${task.type} resource=${resourceId} ok=${ok}`);

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

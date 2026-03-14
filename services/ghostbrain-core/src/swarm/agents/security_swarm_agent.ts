/**
 * GhostBrain Swarm — Security Swarm Agent  (domain: security)
 *
 * Handles security tasks: suspicious RPC calls, unauthorized access attempts,
 * container allowlist violations, anomalous traffic patterns.
 *
 * Non-critical events are stored in GhostBrain memory for learning.
 * Critical threats (intrusion, tampering, unauthorized) are escalated to the
 * signing relay for human response — never auto-blocked autonomously.
 */

import { request }     from "undici";
import { store_event } from "../../memory_engine.js";
import { log }         from "../../observability/event_logger.js";
import type { SwarmAgent, SwarmTask, SwarmResult } from "../swarm_types.js";

const SIGNING_RELAY = process.env.SIGNING_RELAY_URL ?? "http://localhost:7910";

const CRITICAL_RE = /unauthorized|tampering|intrusion|rpc_exploit/i;

export class SecuritySwarmAgent implements SwarmAgent {
  readonly name   = "SecuritySwarmAgent";
  readonly domain = "security" as const;

  private _handled   = 0;
  private _escalated = 0;

  canHandle(task: SwarmTask): boolean {
    return (
      task.domain === "security" ||
      /security_alert|unauthorized|suspicious_rpc|access_denied/i.test(task.type)
    );
  }

  async execute(task: SwarmTask): Promise<SwarmResult> {
    this._handled++;
    const start      = Date.now();
    const resourceId = String(task.data.resourceId ?? "unknown");
    const isCritical = CRITICAL_RE.test(task.type);

    // Always record in unified memory for AI learning
    store_event({
      category:   "security",
      label:      "swarm_security_alert",
      resourceId,
      layer:      "security",
      severity:   isCritical ? "critical" : "warning",
      payload:    { type: task.type, ...task.data },
    });

    let ok     = true;
    let detail = "security event recorded in neural memory";

    // Critical threats → escalate to signing relay for human response
    if (isCritical) {
      try {
        const res = await request(SIGNING_RELAY + "/alerts", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({
            level:      "critical",
            type:       task.type,
            resourceId,
            context:    task.data,
            ts:         Date.now(),
            source:     "SecuritySwarmAgent",
          }),
          bodyTimeout: 6_000,
        });
        ok     = res.statusCode < 300;
        detail = ok
          ? "critical alert escalated to signing relay"
          : `signing relay returned ${res.statusCode} — event in memory`;
      } catch (err) {
        detail = `relay unreachable — critical event stored in memory: ${String(err)}`;
      }
      if (ok) this._escalated++;
    }

    log.warn(
      "security_swarm_agent: execute",
      `type=${task.type} resource=${resourceId} critical=${isCritical}`,
    );

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
    return { handled: this._handled, escalated: this._escalated };
  }
}

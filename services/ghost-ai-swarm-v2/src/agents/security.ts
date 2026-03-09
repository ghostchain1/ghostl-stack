/**
 * GhostSecurity AI
 *
 * Real-time exploit monitoring, malicious contract detection, and
 * compromised node isolation. Subscribes to bus alerts from GhostAuditor
 * and escalates to GhostGovernor for ratification.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask, BusEvent } from "../types.js";

const COMPLIANCE_URL  = process.env.COMPLIANCE_URL   ?? "http://127.0.0.1:8090";
const GHOSTBRAIN_URL  = process.env.GHOSTBRAIN_URL    ?? "http://127.0.0.1:7900";

// Known malicious bytecode prefixes (placeholder — populated from threat intel)
const BLOCKED_BYTECODE_PREFIXES: string[] = [];

export class GhostSecurityAgent extends BaseAgent {
  readonly role         = "security" as const;
  readonly name         = "GhostSecurity AI";
  readonly description  = "Exploit monitoring, malicious contract detection, node isolation recommendations";
  readonly capabilities = [
    "monitor-attacks", "block-contract",
    "isolate-node", "threat-intel-sync",
  ];

  constructor() {
    super();
    // Subscribe to exploit alerts from GhostAuditor
    bus.subscribe<Record<string, unknown>>("alert:exploit", (event: BusEvent<Record<string, unknown>>) => {
      void this.handleExploitAlert(event);
    });
  }

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "monitor-attacks": return this.monitorAttacks(task.payload);
      case "block-contract":  return this.blockContract(task.payload);
      default:                return this.securityStatus();
    }
  }

  private async securityStatus(): Promise<Record<string, unknown>> {
    const history = bus.getByType("alert:exploit", 10);
    return {
      recentExploitAlerts: history.length,
      exploits:            history.map(e => ({ source: e.source, ts: e.timestamp, data: e.payload })),
      blockedPrefixes:     BLOCKED_BYTECODE_PREFIXES.length,
      complianceService:   COMPLIANCE_URL,
    };
  }

  private async monitorAttacks(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const txHash = String(payload["txHash"] ?? "");
    if (!txHash) return { error: "txHash required for attack monitor" };

    // Forward to GhostBrain for ML-based attack classification
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(`${GHOSTBRAIN_URL}/api/v1/classify`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ txHash, mode: "attack-detect" }),
        signal:  ctrl.signal,
      });
      if (res.ok) {
        const result = await res.json() as Record<string, unknown>;
        if (result["isAttack"]) {
          bus.publish("alert:exploit", "security", {
            txHash,
            confidence: result["confidence"],
            attackType: result["attackType"],
          });
        }
        return { txHash, ...result, escalated: result["isAttack"] };
      }
    } catch { /* ghostbrain offline */ }

    return {
      txHash,
      status:   "ghostbrain-offline",
      note:     "Manual review required. Connect GhostBrain for ML classification.",
      escalate: true,
    };
  }

  private async blockContract(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const address = String(payload["address"] ?? "");
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return { error: "Valid EVM address required" };
    }

    bus.publish("alert:governance", "security", {
      action:  "block-contract",
      address,
      reason:  String(payload["reason"] ?? "Malicious activity detected"),
      urgent:  true,
    });

    return {
      address,
      action:   "governance-proposal-drafted",
      note:     "Contract blocking requires DAO governance vote — cannot block autonomously",
      humanApprovalRequired: true,
    };
  }

  private async handleExploitAlert(event: BusEvent<Record<string, unknown>>): Promise<void> {
    const data = event.payload;
    if (!data["contract"] && !data["txHash"]) return;

    // Escalate critical exploits to compliance service
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5_000);
      await fetch(`${COMPLIANCE_URL}/api/v1/incidents`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ type: "exploit-alert", source: event.source, data }),
        signal:  ctrl.signal,
      });
    } catch { /* compliance offline — log locally */ }

    bus.publish("alert:governance", "security", {
      type:    "exploit-escalation",
      origin:  event.source,
      payload: data,
      note:    "Escalated to GhostGovernor for constitution enforcement",
    });
  }
}

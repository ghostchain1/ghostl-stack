/**
 * GhostInfra AI
 *
 * Controls servers and VMs, deploys containers, scales services,
 * repairs nodes. Core of the self-healing infrastructure loop.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const INFRA_CONTROLLER_URL = process.env.INFRA_CONTROLLER_URL ?? "http://127.0.0.1:7950";

export class GhostInfraAgent extends BaseAgent {
  readonly role         = "infra" as const;
  readonly name         = "GhostInfra AI";
  readonly description  = "Controls VMs, containers, scaling, and self-healing infrastructure";
  readonly capabilities = [
    "provision-vm", "scale-service", "repair-node",
    "deploy-container", "monitor-resources",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "provision-vm":  return this.provisionVm(task.payload);
      case "scale-service": return this.scaleService(task.payload);
      case "repair-node":   return this.repairNode(task.payload);
      default:              return this.repairNode(task.payload);
    }
  }

  private async provisionVm(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const vmSpec = {
      role:      (payload["role"]    as string | undefined) ?? "validator",
      cpus:      (payload["cpus"]    as number | undefined) ?? 4,
      memoryGiB: (payload["memory"]  as number | undefined) ?? 8,
      diskGiB:   (payload["disk"]    as number | undefined) ?? 100,
      region:    (payload["region"]  as string | undefined) ?? "ghost-dc-1",
    };

    return await this.relayAction("provision", vmSpec) ??
      { status: "queued", vmSpec, note: "VM provisioning queued (infra-controller offline)" };
  }

  private async scaleService(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const service  = (payload["service"]  as string | undefined) ?? "unknown";
    const replicas = (payload["replicas"] as number | undefined) ?? 2;

    return await this.relayAction("scale", { service, replicas }) ??
      { status: "queued", service, replicas, note: "Scale action queued" };
  }

  private async repairNode(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const nodeId  = (payload["nodeId"]  as string | undefined) ?? "unknown";
    const issue   = (payload["issue"]   as string | undefined) ?? "unresponsive";

    bus.publish("agent:degraded", "infra", { nodeId, issue });

    const actions: string[] = [];
    if (issue === "unresponsive" || issue === "crashed") {
      actions.push("restart-process", "check-disk", "clear-cache");
    } else if (issue === "out-of-sync") {
      actions.push("resync-from-peer", "clear-state-db", "restart-sync");
    } else if (issue === "low-memory") {
      actions.push("evict-cache", "scale-up-memory", "alert-ops");
    }

    const result = await this.relayAction("repair", { nodeId, issue, actions });
    return result ?? { nodeId, issue, actionsPlanned: actions, status: "repair-initiated" };
  }

  private async relayAction(action: string, params: object): Promise<Record<string, unknown> | null> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch(`${INFRA_CONTROLLER_URL}/actions/${action}`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(params),
        signal:  ctrl.signal,
      });
      if (res.ok) return await res.json() as Record<string, unknown>;
    } catch { /* infra controller offline */ }
    return null;
  }
}

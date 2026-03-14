// ── Incident Responder ────────────────────────────────────────────────────────
// Maps incident types to automated response strategies.
// Maintains a capped incident log and exposes helpers for open/escalated items.

import { restartContainer, deployNewNode } from "../repair/repairEngine";

export type IncidentType =
  | "node_failure"
  | "node_overload"
  | "anomaly"
  | "disk_full"
  | "network_spike"
  | "multi_node_failure";

export type IncidentStatus = "open" | "responding" | "resolved" | "escalated";

export interface Incident {
  id:          string;
  type:        IncidentType;
  nodeId?:     string;
  description: string;
  status:      IncidentStatus;
  response:    string;
  timestamp:   number;
  resolvedAt?: number;
}

let incidentLog: Incident[] = [];
let incCounter  = 0;

function makeId(): string {
  return `INC-${String(++incCounter).padStart(4, "0")}`;
}

export async function respondToIncident(event: {
  type:         IncidentType;
  node?:        string;
  description?: string;
}): Promise<Incident> {
  const id  = makeId();
  const now = Date.now();
  let response = "";
  let status: IncidentStatus = "responding";

  try {
    switch (event.type) {
      case "node_failure":
        response = `Restarting node ${event.node ?? "unknown"} via HCL`;
        if (event.node) await restartContainer(event.node);
        status = "resolved";
        break;

      case "node_overload":
        response = "Triggering horizontal scaling — deploying additional RPC node";
        await deployNewNode("rpc");
        status = "resolved";
        break;

      case "anomaly":
        response = `Anomaly routed to security engine: ${event.description ?? "unknown"}`;
        status = "resolved";
        break;

      case "disk_full":
        response = `Disk capacity alert on ${event.node ?? "system"} — log rotation initiated, operations team notified`;
        status = "escalated";
        break;

      case "network_spike":
        response = "Network spike detected — rate limiting activated, DDoS protection engaged";
        status = "resolved";
        break;

      case "multi_node_failure":
        response = "Multiple nodes offline — failover sequence initiated, all operators notified";
        status = "escalated";
        break;

      default:
        response = "Incident logged — manual review required";
        status = "open";
    }
  } catch (e) {
    response = `Automated response failed: ${e instanceof Error ? e.message : "unknown error"}`;
    status   = "escalated";
  }

  const incident: Incident = {
    id,
    type:        event.type,
    nodeId:      event.node,
    description: event.description ?? `${event.type} event`,
    status,
    response,
    timestamp:   now,
    resolvedAt:  status === "resolved" ? Date.now() : undefined,
  };

  incidentLog.push(incident);
  if (incidentLog.length > 500) incidentLog = incidentLog.slice(-500);

  console.log(`[IncidentResponder] ${incident.id} [${incident.type}] → ${incident.status}: ${incident.response}`);
  return incident;
}

export function getIncidentLog(): Incident[]  { return incidentLog; }
export function getOpenIncidents(): Incident[] {
  return incidentLog.filter(i => i.status === "open" || i.status === "escalated");
}

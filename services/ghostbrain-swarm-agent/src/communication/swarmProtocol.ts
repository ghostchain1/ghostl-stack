// GhostBrain Swarm — typed message protocol

export type SwarmTopic =
  | 'validator.alert'
  | 'network.alert'
  | 'security.alert'
  | 'agent.heartbeat';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface SwarmMessage {
  /** Originating agent identifier (hostname or AGENT_ID env) */
  agentId: string;
  /** Node type: validator | l1 | l2 | l3 | docker | hypervisor */
  nodeType: string;
  /** NATS subject this message was published on */
  topic: SwarmTopic;
  severity: AlertSeverity;
  /** Human-readable alert type, e.g. "high_cpu" | "low_peers" | "anomaly_detected" */
  type: string;
  /** Numeric scalar value associated with the alert (optional) */
  value?: number;
  /** Human-readable summary */
  detail: string;
  /** Arbitrary structured payload */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp */
  ts: string;
}

export interface AgentHeartbeat {
  agentId: string;
  nodeType: string;
  status: 'healthy' | 'degraded' | 'unknown';
  uptimeSec: number;
  ts: string;
}

/** Proposal forwarded from coordinator to signing relay */
export interface SwarmProposal {
  id: string;
  source: 'swarm-coordinator';
  trigger: SwarmMessage;
  action: string;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

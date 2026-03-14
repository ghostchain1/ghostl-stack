// GhostBrain Swarm — typed message protocol (shared copy for coordinator)
export type SwarmTopic =
  | 'validator.alert'
  | 'network.alert'
  | 'security.alert'
  | 'agent.heartbeat';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface SwarmMessage {
  agentId: string;
  nodeType: string;
  topic: SwarmTopic;
  severity: AlertSeverity;
  type: string;
  value?: number;
  detail: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface AgentHeartbeat {
  agentId: string;
  nodeType: string;
  status: 'healthy' | 'degraded' | 'unknown';
  uptimeSec: number;
  ts: string;
}

export interface SwarmProposal {
  id: string;
  source: 'swarm-coordinator';
  trigger: SwarmMessage;
  action: string;
  rationale: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

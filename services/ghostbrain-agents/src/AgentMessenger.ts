/**
 * AgentMessenger — typed message bus between GhostBrain agents.
 */
export interface AgentMessage {
  id:        string;
  from:      string;
  to:        string;
  type:      string;
  payload:   Record<string, unknown>;
  timestamp: number;
}

export class AgentMessenger {
  private log: AgentMessage[] = [];

  send(from: string, to: string, type: string, payload: Record<string, unknown>): AgentMessage {
    const msg: AgentMessage = {
      id:        `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      from, to, type, payload,
      timestamp: Date.now(),
    };
    this.log.push(msg);
    console.log(`[Messenger] ${from} → ${to}: ${type}`);
    return msg;
  }

  history(limit = 50): AgentMessage[] {
    return this.log.slice(-limit);
  }
}

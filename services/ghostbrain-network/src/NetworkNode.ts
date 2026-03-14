/**
 * NetworkNode — a single GhostBrain peer in the Global Intelligence Network.
 */
export interface NodeMessage {
  from:      string;
  type:      string;
  payload:   Record<string, unknown>;
  timestamp: number;
}

export class NetworkNode {
  readonly id:    string;
  readonly peers: string[] = [];
  private inbox:  NodeMessage[] = [];

  constructor(id: string) {
    this.id = id;
  }

  connect(peerId: string): void {
    if (!this.peers.includes(peerId)) this.peers.push(peerId);
  }

  broadcast(type: string, payload: Record<string, unknown>): NodeMessage {
    const msg: NodeMessage = { from: this.id, type, payload, timestamp: Date.now() };
    console.log(`[${this.id}] Broadcasting '${type}' to ${this.peers.length} peers`);
    return msg;
  }

  receive(msg: NodeMessage): void {
    this.inbox.push(msg);
  }

  messages(limit = 50): NodeMessage[] {
    return this.inbox.slice(-limit);
  }
}

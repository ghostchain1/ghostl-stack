/**
 * NetworkRegistry — global registry of all GhostBrain network nodes.
 */
export interface NodeInfo {
  id:         string;
  role:       "L1_validator" | "L2_sequencer" | "L3_node" | "hypervisor" | "treasury" | "exchange";
  endpoint:   string;
  trustScore: number;  // 0-100
  online:     boolean;
}

export class NetworkRegistry {
  private nodes: Map<string, NodeInfo> = new Map();

  register(info: NodeInfo): void {
    this.nodes.set(info.id, info);
  }

  get(id: string): NodeInfo | undefined {
    return this.nodes.get(id);
  }

  list(): NodeInfo[] {
    return [...this.nodes.values()];
  }

  online(): NodeInfo[] {
    return this.list().filter(n => n.online);
  }

  topTrusted(n = 5): NodeInfo[] {
    return this.list()
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, n);
  }
}

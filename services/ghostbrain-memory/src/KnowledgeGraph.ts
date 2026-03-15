/**
 * KnowledgeGraph — tracks relationships between GhostStack components.
 */
export interface KnowledgeEdge {
  from:   string;
  to:     string;
  type:   string;
  weight: number;
}

export class KnowledgeGraph {
  private graph: Map<string, KnowledgeEdge[]> = new Map();

  connect(from: string, to: string, type = "depends_on", weight = 1.0): void {
    const edges = this.graph.get(from) ?? [];
    edges.push({ from, to, type, weight });
    this.graph.set(from, edges);
  }

  getConnections(node: string): KnowledgeEdge[] {
    return this.graph.get(node) ?? [];
  }

  allNodes(): string[] {
    return [...this.graph.keys()];
  }

  /** Returns nodes that influence `target`. */
  influencers(target: string): string[] {
    return [...this.graph.entries()]
      .filter(([, edges]) => edges.some(e => e.to === target))
      .map(([node]) => node);
  }

  /** Initialises the default GhostStack topology. */
  initGhostTopology(): void {
    this.connect("GhostChain",  "GhostL2",      "bridges_to");
    this.connect("GhostL2",     "GhostL3",      "bridges_to");
    this.connect("GhostL3",     "Bridge",        "uses");
    this.connect("Bridge",      "Treasury",      "funds");
    this.connect("Treasury",    "Governance",    "controlled_by");
    this.connect("Governance",  "GhostChain",    "upgrades");
    this.connect("GhostBrain",  "GhostChain",    "monitors");
    this.connect("GhostBrain",  "GhostL2",       "monitors");
    this.connect("GhostBrain",  "GhostL3",       "monitors");
  }
}

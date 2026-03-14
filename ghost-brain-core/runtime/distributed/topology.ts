/**
 * GhostBrain Runtime — Topology
 *
 * Describes the physical and logical topology of GhostBrain compute nodes.
 * Used by collective algorithms (AllReduce, AllToAll, Broadcast) to select
 * communication-optimal orderings.
 *
 * Phase 1: single-node (all ranks on one machine, SharedArrayBuffer)
 * Phase 5: multi-node mesh (RoCEv2 fabric, 512 Gbps all-to-all)
 */

export type NodeId = number; // 0-based rank

export interface TopologyNode {
  rank:        NodeId;
  host:        string;
  port:        number;
  /** Index into the 2D mesh (row, col) */
  meshRow:     number;
  meshCol:     number;
}

export class Topology {
  private readonly nodes: TopologyNode[];
  private readonly rows:  number;
  private readonly cols:  number;

  constructor(nodes: TopologyNode[]) {
    this.nodes = nodes;
    this.rows  = Math.max(...nodes.map(n => n.meshRow)) + 1 || 1;
    this.cols  = Math.max(...nodes.map(n => n.meshCol)) + 1 || 1;
  }

  /** Compute a ring ordering that traverses the 2D mesh in snake-scan order
   *  to minimise link contention for ring-AllReduce. */
  computeRingOrder(): NodeId[] {
    const ring: NodeId[] = [];
    for (let r = 0; r < this.rows; ++r) {
      const row = this.nodes.filter(n => n.meshRow === r)
                            .sort((a, b) => r % 2 === 0 ? a.meshCol - b.meshCol
                                                         : b.meshCol - a.meshCol);
      for (const n of row) ring.push(n.rank);
    }
    return ring;
  }

  /** Returns neighbours (N/S/E/W) for a given rank in the 2D mesh. */
  neighbours(rank: NodeId): { north?: NodeId; south?: NodeId; east?: NodeId; west?: NodeId } {
    const node = this.nodes[rank];
    if (!node) return {};
    const find = (r: number, c: number) =>
      this.nodes.find(n => n.meshRow === r && n.meshCol === c)?.rank;
    return {
      north: find(node.meshRow - 1, node.meshCol),
      south: find(node.meshRow + 1, node.meshCol),
      east:  find(node.meshRow,     node.meshCol + 1),
      west:  find(node.meshRow,     node.meshCol - 1),
    };
  }

  get size(): number { return this.nodes.length; }

  /** Build a single-node topology (Phase 1 default). */
  static singleNode(): Topology {
    return new Topology([{ rank: 0, host: "127.0.0.1", port: 7900, meshRow: 0, meshCol: 0 }]);
  }

  /** Build a topology from environment variable GHOSTBRAIN_NODES (JSON array). */
  static fromEnv(): Topology {
    const raw = process.env.GHOSTBRAIN_NODES;
    if (!raw) return Topology.singleNode();
    const nodes = JSON.parse(raw) as TopologyNode[];
    return new Topology(nodes);
  }
}

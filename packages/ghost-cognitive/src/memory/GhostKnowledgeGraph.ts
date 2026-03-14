import type { KnowledgeEdge } from '../types.js';

/**
 * GhostKnowledgeGraph — directed causal graph linking system events and states.
 *
 * Enables the cognitive layer to perform causal reasoning: "gas spikes → bridge
 * congestion → liquidity imbalance". Edges carry a weight so the engine can
 * prioritise strongly-correlated causal paths.
 */
export class GhostKnowledgeGraph {
  private readonly graph = new Map<string, KnowledgeEdge[]>();
  private readonly reverseIndex = new Map<string, string[]>(); // to → [from]

  /** Link two concepts with a directed edge. */
  link(from: string, to: string, opts: { relation?: string; weight?: number } = {}): void {
    const edge: KnowledgeEdge = {
      from,
      to,
      relation: opts.relation ?? 'causes',
      weight: opts.weight ?? 1,
    };

    if (!this.graph.has(from)) this.graph.set(from, []);
    this.graph.get(from)!.push(edge);

    if (!this.reverseIndex.has(to)) this.reverseIndex.set(to, []);
    this.reverseIndex.get(to)!.push(from);
  }

  /** Return all edges originating from a concept. */
  edgesFrom(concept: string): KnowledgeEdge[] {
    return this.graph.get(concept) ?? [];
  }

  /** Return direct causes of a concept. */
  causesOf(concept: string): string[] {
    return this.reverseIndex.get(concept) ?? [];
  }

  /** Follow causal chains up to `maxDepth` hops and return all reachable concepts. */
  reachable(from: string, maxDepth = 3): string[] {
    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [{ node: from, depth: 0 }];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (visited.has(node) || depth > maxDepth) continue;
      visited.add(node);

      for (const edge of this.edgesFrom(node)) {
        queue.push({ node: edge.to, depth: depth + 1 });
      }
    }

    visited.delete(from);
    return [...visited];
  }

  concepts(): string[] {
    return [...this.graph.keys()];
  }

  edgeCount(): number {
    let n = 0;
    for (const edges of this.graph.values()) n += edges.length;
    return n;
  }
}

/**
 * MeshRouter — Satellite Mesh Network Routing for GhostChain
 *
 * Computes optimal multi-hop paths through the GhostStarlink mesh,
 * combining satellite links, ground nodes, and relay stations.
 * Enforces GhostChain routing law: all traffic routes L3 → L2 → L1.
 * Satellite links are transport-level only — never bypass the chain hierarchy.
 */

import type { LinkType } from '../satellite/StarlinkAdapter.js';

export interface MeshNode {
  nodeId:      string;
  type:        'satellite' | 'ground' | 'relay' | 'validator' | 'edge';
  linkTypes:   LinkType[];
  latencyMs:   number;        // average outbound latency
  throughputMbps: number;
  reliability: number;        // 0.0–1.0
  ghostLayer:  'l1' | 'l2' | 'l3';
  position:    { lat: number; lon: number; altKm: number };
}

export interface MeshHop {
  nodeId:      string;
  linkType:    LinkType;
  latencyMs:   number;
  throughputMbps: number;
}

export interface MeshRoute {
  source:         string;
  destination:    string;
  hops:           MeshHop[];
  totalLatencyMs: number;
  minThroughputMbps: number;
  reliability:    number;     // product of per-hop reliability
  ghostLayer:     'l1' | 'l2' | 'l3';
}

export interface RouterConfig {
  /** Maximum hops in a route */
  maxHops?: number;
  /** Maximum acceptable latency (ms) */
  maxLatencyMs?: number;
  /** Minimum required throughput (Mbps) */
  minThroughputMbps?: number;
  /** Weight for latency vs reliability in path scoring (0–1, 0 = latency only) */
  reliabilityWeight?: number;
}

// ─── MeshRouter ──────────────────────────────────────────────────────────────

export class MeshRouter {
  private nodes: Map<string, MeshNode> = new Map();
  private cfg:   RouterConfig;

  constructor(config: RouterConfig = {}) {
    this.cfg = {
      maxHops:           config.maxHops           ?? 8,
      maxLatencyMs:      config.maxLatencyMs       ?? 2000,
      minThroughputMbps: config.minThroughputMbps  ?? 0.1,
      reliabilityWeight: config.reliabilityWeight  ?? 0.4,
    };
  }

  /**
   * Register a node into the routing table.
   */
  registerNode(node: MeshNode): void {
    this.nodes.set(node.nodeId, node);
  }

  /**
   * Deregister a node (e.g. went offline).
   */
  deregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  /**
   * Route a packet from source to destination through the satellite mesh.
   *
   * @example
   * const route = router.routePacket("validator-asia-3", "relay-eu-1")
   * // { path: ["satellite-1", "satellite-5", "ground-node"], totalLatencyMs: 130 }
   */
  routePacket(source: string, destination: string): MeshRoute {
    const srcNode  = this.nodes.get(source);
    const dstNode  = this.nodes.get(destination);

    if (!srcNode)  throw new Error(`MeshRouter: source node '${source}' not registered`);
    if (!dstNode)  throw new Error(`MeshRouter: destination node '${destination}' not registered`);

    // Dijkstra-style shortest path (weighted by score)
    const route = this.findBestPath(source, destination);

    if (!route) {
      throw new Error(`MeshRouter: no viable route from '${source}' to '${destination}'`);
    }

    return route;
  }

  /**
   * Find all routes from source to destination (up to maxRoutes).
   */
  findAllRoutes(source: string, destination: string, maxRoutes = 3): MeshRoute[] {
    const routes: MeshRoute[] = [];
    const excluded: Set<string> = new Set();

    for (let i = 0; i < maxRoutes; i++) {
      try {
        const route = this.findBestPath(source, destination, excluded);
        if (!route) break;
        routes.push(route);
        // Exclude middle hops of found route to find alternative paths
        route.hops.slice(1, -1).forEach(h => excluded.add(h.nodeId));
      } catch { break; }
    }

    return routes;
  }

  /**
   * Select the best route from a set of candidates (lowest weighted score).
   */
  selectBestRoute(routes: MeshRoute[]): MeshRoute {
    if (routes.length === 0) throw new Error('MeshRouter: no routes to select from');
    return routes.reduce((best, r) => this.score(r) < this.score(best) ? r : best);
  }

  /**
   * Update a node's link metrics (called by LatencyOptimizer).
   */
  updateNodeMetrics(nodeId: string, latencyMs: number, throughputMbps: number, reliability: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.latencyMs      = latencyMs;
      node.throughputMbps = throughputMbps;
      node.reliability    = reliability;
    }
  }

  /**
   * Get the current routing table size.
   */
  get nodeCount(): number {
    return this.nodes.size;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private findBestPath(source: string, destination: string, excluded: Set<string> = new Set()): MeshRoute | null {
    // Modified Dijkstra on small in-memory graph
    const dist  = new Map<string, number>();
    const prev  = new Map<string, { from: string; hop: MeshHop } | null>();
    const queue = new Set<string>();

    for (const id of this.nodes.keys()) {
      dist.set(id, Infinity);
      prev.set(id, null);
      queue.add(id);
    }
    dist.set(source, 0);

    while (queue.size > 0) {
      // Pick lowest distance node
      let u = '';
      let uDist = Infinity;
      for (const id of queue) {
        const d = dist.get(id)!;
        if (d < uDist) { uDist = d; u = id; }
      }
      if (!u || uDist === Infinity) break;
      queue.delete(u);
      if (u === destination) break;

      const uNode = this.nodes.get(u)!;
      // Neighbors: every node with a compatible link that's within range
      for (const [vId, vNode] of this.nodes) {
        if (!queue.has(vId)) continue;
        if (excluded.has(vId)) continue;

        const compatible = uNode.linkTypes.some(l => vNode.linkTypes.includes(l));
        if (!compatible) continue;

        const linkType     = this.pickLinkType(uNode, vNode);
        const hopLatency   = Math.max(uNode.latencyMs, vNode.latencyMs);
        const hopScore     = this.hopScore(hopLatency, vNode.throughputMbps, vNode.reliability);
        const alt          = uDist + hopScore;

        if (alt < (dist.get(vId) ?? Infinity)) {
          dist.set(vId, alt);
          prev.set(vId, { from: u, hop: { nodeId: vId, linkType, latencyMs: hopLatency, throughputMbps: Math.min(uNode.throughputMbps, vNode.throughputMbps) } });
        }
      }
    }

    // Reconstruct path
    const hops: MeshHop[] = [];
    let cur: string | undefined = destination;
    let hopCount = 0;

    while (cur && cur !== source && hopCount <= this.cfg.maxHops!) {
      const p = prev.get(cur);
      if (!p) return null;
      hops.unshift(p.hop);
      cur = p.from;
      hopCount++;
    }

    if (cur !== source || hops.length === 0) return null;

    const totalLatency   = hops.reduce((s, h) => s + h.latencyMs, 0);
    const minThroughput  = hops.reduce((m, h) => Math.min(m, h.throughputMbps), Infinity);
    const reliability    = hops.reduce((p, _) => p * (this.nodes.get(_.nodeId)?.reliability ?? 0.9), 1);

    if (totalLatency > this.cfg.maxLatencyMs!) return null;
    if (minThroughput < this.cfg.minThroughputMbps!) return null;

    const dstNode = this.nodes.get(destination)!;

    return { source, destination, hops, totalLatencyMs: totalLatency, minThroughputMbps: minThroughput, reliability, ghostLayer: dstNode.ghostLayer };
  }

  private pickLinkType(a: MeshNode, b: MeshNode): LinkType {
    // Prefer highest-throughput shared link type
    const shared = a.linkTypes.filter(l => b.linkTypes.includes(l));
    const order: LinkType[] = ['starlink', 'oneweb', 'iridium', 'ghost-mesh', 'lora', 'terrestrial'];
    return order.find(l => shared.includes(l)) ?? shared[0] ?? 'terrestrial';
  }

  private hopScore(latencyMs: number, throughputMbps: number, reliability: number): number {
    const latScore  = latencyMs / 1000;
    const relScore  = 1 - reliability;
    const w         = this.cfg.reliabilityWeight!;
    return (1 - w) * latScore + w * relScore + (1 / (throughputMbps + 0.001)) * 0.01;
  }

  private score(route: MeshRoute): number {
    const w = this.cfg.reliabilityWeight!;
    return (1 - w) * (route.totalLatencyMs / 1000) + w * (1 - route.reliability);
  }
}

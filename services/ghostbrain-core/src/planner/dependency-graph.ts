/**
 * GhostBrain Core — Dependency Graph
 *
 * Maintains a directed graph of service dependencies so the Planner
 * can reason about blast radius and change ordering.
 *
 * Nodes: services, databases, network components, chains
 * Edges: "depends on" (directed)
 */

import type { HealthNode, SystemHealthGraph, NodeHealth, Layer } from "../types.js";
import { logger } from "../logger.js";

export class DependencyGraph {
  private nodes: Map<string, HealthNode> = new Map();

  upsertNode(node: HealthNode): void {
    this.nodes.set(node.nodeId, node);
  }

  getNode(nodeId: string): HealthNode | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): HealthNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Compute the set of nodes that would be impacted by a change to `nodeId`.
   * "Impacted" means: depends (directly or transitively) on the changed node.
   */
  impactedBy(nodeId: string): HealthNode[] {
    const impacted: Set<string> = new Set();
    this._collectDependents(nodeId, impacted);
    return Array.from(impacted).map(id => this.nodes.get(id)!).filter(Boolean);
  }

  private _collectDependents(targetId: string, result: Set<string>): void {
    for (const node of this.nodes.values()) {
      if (node.dependsOn.includes(targetId) && !result.has(node.nodeId)) {
        result.add(node.nodeId);
        this._collectDependents(node.nodeId, result);
      }
    }
  }

  /**
   * Topological ordering for change steps (leaves first).
   * Returns nodeIds in safe execution order.
   */
  topologicalOrder(nodeIds: string[]): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) {
        for (const dep of node.dependsOn) {
          if (nodeIds.includes(dep)) visit(dep);
        }
      }
      order.push(id);
    };

    for (const id of nodeIds) visit(id);
    return order;
  }

  toHealthGraph(): SystemHealthGraph {
    const anomalies: string[] = [];
    for (const [id, node] of this.nodes) {
      if (node.health === "degraded" || node.health === "down") anomalies.push(id);
    }
    return { updatedAt: new Date().toISOString(), nodes: this.nodes, anomalies };
  }

  updateHealth(nodeId: string, health: NodeHealth): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.health = health;
      node.lastChecked = new Date().toISOString();
      logger.debug("Health updated", { nodeId, health });
    }
  }

  /**
   * Bootstrap the graph with static definitions.
   * In production this is supplemented by discovery from docker/libvirt/prometheus.
   */
  static buildDefault(): DependencyGraph {
    const g = new DependencyGraph();

    const makeNode = (
      nodeId: string,
      name: string,
      type: HealthNode["type"],
      layer: Layer,
      dependsOn: string[],
    ): HealthNode => ({
      nodeId,
      name,
      type,
      layer,
      health: "unknown",
      lastChecked: new Date().toISOString(),
      dependsOn,
      metrics: {},
    });

    // L1 chain (root)
    g.upsertNode(makeNode("l1-chain", "GhostChain L1", "chain", "L1", []));

    // L2 services depend on L1
    g.upsertNode(makeNode("l2-chain", "GhostChain L2", "chain", "L2", ["l1-chain"]));
    g.upsertNode(makeNode("l2-db", "L2 Postgres", "db", "L2", []));
    g.upsertNode(makeNode("l2-redis", "L2 Redis", "network", "L2", []));
    g.upsertNode(makeNode("ghost-sync-sentinel", "ghost-sync-sentinel", "service", "L2", ["l2-chain", "l2-db"]));
    g.upsertNode(makeNode("ghostcontract-ai", "ghostcontract-ai", "service", "L2", ["l2-chain", "l2-db"]));
    g.upsertNode(makeNode("ghost-guard", "ghost-guard", "service", "L2", ["l2-db"]));

    // L3 services depend on L2 (never on L1 directly — routing law)
    g.upsertNode(makeNode("l3-chain", "GhostChain L3", "chain", "L3", ["l2-chain"]));
    g.upsertNode(makeNode("l3-db", "L3 Postgres", "db", "L3", []));
    g.upsertNode(makeNode("ghost-treasury-ai", "ghost-treasury-ai", "service", "L3", ["l3-chain", "l2-chain"]));

    return g;
  }
}

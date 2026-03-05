import type { GhostSwarmNode } from './GhostSwarmNode.js';
import type { SwarmNodeInfo } from '../types.js';

/**
 * GhostSwarmRegistry — global directory of all swarm nodes.
 *
 * The registry is the single source of truth for node membership. The controller
 * queries it when deciding whom to broadcast to; the multi-region balancer uses it
 * to select healthy targets.
 */
export class GhostSwarmRegistry {
  private readonly nodes = new Map<string, GhostSwarmNode>();

  add(node: GhostSwarmNode): void {
    this.nodes.set(node.id, node);
  }

  remove(nodeId: string): boolean {
    return this.nodes.delete(nodeId);
  }

  get(nodeId: string): GhostSwarmNode | undefined {
    return this.nodes.get(nodeId);
  }

  has(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  list(): GhostSwarmNode[] {
    return [...this.nodes.values()];
  }

  listInfo(): SwarmNodeInfo[] {
    return this.list().map(n => n.info());
  }

  /** Filter nodes by role (e.g. 'hypervisor', 'validator', 'ai-service'). */
  byRole(role: string): GhostSwarmNode[] {
    return this.list().filter(n => n.role === role);
  }

  /** Filter nodes by region. */
  byRegion(region: string): GhostSwarmNode[] {
    return this.list().filter(n => n.region === region);
  }

  count(): number {
    return this.nodes.size;
  }

  clear(): void {
    this.nodes.clear();
  }
}

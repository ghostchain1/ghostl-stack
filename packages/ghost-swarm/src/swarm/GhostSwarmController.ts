import type { GhostSwarmNode } from './GhostSwarmNode.js';
import type { SwarmEvent, SwarmEventHandler } from '../types.js';

/**
 * GhostSwarmController — central coordinator for the Ghost Swarm Intelligence Layer.
 *
 * Maintains the set of registered swarm nodes, broadcasts events to all of them,
 * and supports pluggable global event hooks for cross-cutting concerns (telemetry,
 * audit trails, etc.).
 */
export class GhostSwarmController {
  private readonly nodes: GhostSwarmNode[] = [];
  private readonly hooks: SwarmEventHandler[] = [];
  private readonly startedAt: number = Date.now();

  /** Register a node with the controller. Idempotent on node id. */
  register(node: GhostSwarmNode): void {
    if (this.nodes.some(n => n.id === node.id)) return;
    this.nodes.push(node);
  }

  /** Unregister a node by id. */
  unregister(nodeId: string): void {
    const idx = this.nodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) this.nodes.splice(idx, 1);
  }

  /** Attach a global event hook called before each broadcast. */
  addHook(handler: SwarmEventHandler): void {
    this.hooks.push(handler);
  }

  /**
   * Broadcast a SwarmEvent to all registered nodes.
   * Hooks are called first (synchronously); then each node.receive() is called.
   * Per-node errors are caught and logged to avoid one faulty node blocking others.
   */
  broadcast(event: SwarmEvent): void {
    for (const hook of this.hooks) {
      try { hook(event); } catch { /* hook errors are non-fatal */ }
    }
    for (const node of this.nodes) {
      try {
        node.receive(event);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[GhostSwarmController] node ${node.id} error during broadcast: ${msg}`);
      }
    }
  }

  /** Snapshot of currently registered node ids. */
  nodeIds(): string[] {
    return this.nodes.map(n => n.id);
  }

  nodeCount(): number {
    return this.nodes.length;
  }

  uptimeMs(): number {
    return Date.now() - this.startedAt;
  }
}

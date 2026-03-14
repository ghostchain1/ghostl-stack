/**
 * GhostBrain Global Orchestrator — Node Registry
 *
 * The single source of truth for all GhostNodes known to the orchestrator.
 * Maintains secondary indexes for fast lookups by region and by role.
 *
 * All mutation methods validate node IDs and host names before mutating
 * the registry to prevent injection of crafted node entries.
 *
 * This is an in-process store — it is NOT a database.  Persistence is
 * handled by callers that write to the Memory Engine if required.
 */

import { randomUUID } from "crypto";
import type { GhostNode, NodeRole } from "../types.js";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Allowed hostname/IP format — prevents SSRF and path traversal in node IDs. */
const SAFE_HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,253}$/;

/** Region/role slugs: lowercase alphanumeric + hyphen. */
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,63}$/;

// ---------------------------------------------------------------------------
// NodeRegistry
// ---------------------------------------------------------------------------

export class NodeRegistry {
  private readonly primary = new Map<string, GhostNode>();
  /** Secondary index: regionId → nodeIds */
  private readonly byRegion = new Map<string, Set<string>>();
  /** Secondary index: role → nodeIds */
  private readonly byRole   = new Map<string, Set<string>>();

  /**
   * Register a new node.  Generates a UUID id if the node has none.
   * Throws on invalid host or region slug.
   */
  register(node: GhostNode): GhostNode {
    this.validate(node);

    if (!node.id) {
      (node as { id: string }).id = randomUUID();
    }

    this.primary.set(node.id, node);
    this.index(node);
    return node;
  }

  /**
   * Update an existing node in-place.
   * Throws if the node ID is not registered.
   */
  update(node: GhostNode): void {
    if (!this.primary.has(node.id)) {
      throw new Error(`node ${node.id} not found in registry`);
    }
    const old = this.primary.get(node.id)!;
    // Deindex old role/region in case they changed (unusual but possible).
    this.deindex(old);
    this.primary.set(node.id, node);
    this.index(node);
  }

  /** Remove a node by ID. No-op if not found. */
  remove(nodeId: string): void {
    const node = this.primary.get(nodeId);
    if (!node) return;
    this.deindex(node);
    this.primary.delete(nodeId);
  }

  get(nodeId: string): GhostNode | undefined {
    return this.primary.get(nodeId);
  }

  getAll(): GhostNode[] {
    return [...this.primary.values()];
  }

  getByRegion(regionId: string): GhostNode[] {
    const ids = this.byRegion.get(regionId) ?? new Set();
    return [...ids].map(id => this.primary.get(id)!).filter(Boolean);
  }

  getByRole(role: NodeRole): GhostNode[] {
    const ids = this.byRole.get(role) ?? new Set();
    return [...ids].map(id => this.primary.get(id)!).filter(Boolean);
  }

  getByRegionAndRole(regionId: string, role: NodeRole): GhostNode[] {
    return this.getByRegion(regionId).filter(n => n.role === role);
  }

  get size(): number { return this.primary.size; }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private validate(node: GhostNode): void {
    if (node.id && !UUID_RE.test(node.id)) {
      throw new Error(`invalid node id format: "${node.id}"`);
    }
    if (!SAFE_HOST_RE.test(node.host)) {
      throw new Error(`invalid node host: "${node.host}"`);
    }
    if (!SAFE_SLUG_RE.test(node.region)) {
      throw new Error(`invalid region slug: "${node.region}"`);
    }
    if (node.rpcPort < 1 || node.rpcPort > 65535) {
      throw new Error(`invalid rpcPort: ${node.rpcPort}`);
    }
  }

  private index(node: GhostNode): void {
    if (!this.byRegion.has(node.region)) {
      this.byRegion.set(node.region, new Set());
    }
    this.byRegion.get(node.region)!.add(node.id);

    if (!this.byRole.has(node.role)) {
      this.byRole.set(node.role, new Set());
    }
    this.byRole.get(node.role)!.add(node.id);
  }

  private deindex(node: GhostNode): void {
    this.byRegion.get(node.region)?.delete(node.id);
    this.byRole.get(node.role)?.delete(node.id);
  }
}

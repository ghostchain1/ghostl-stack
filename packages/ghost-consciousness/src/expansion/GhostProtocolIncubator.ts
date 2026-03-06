import crypto from 'node:crypto';
import type { ProtocolProposal } from '../types.js';

/**
 * GhostProtocolIncubator — autonomous protocol ideation and staging engine.
 *
 * The Incubator maintains a lifecycle for new protocols from initial idea
 * (experimental) through incubation, validation, and launch. It acts as the
 * R&D arm of the Consciousness Layer — generating, prioritising, and tracking
 * the next wave of GhostStack protocols.
 *
 * Lifecycle states:
 *   experimental → incubating → validated → launched
 *                           ↘ deprecated (abandoned before launch)
 *
 * Example protocol categories: defi, gaming, identity, infrastructure,
 * governance, social.
 */
export class GhostProtocolIncubator {
  private readonly protocols = new Map<string, ProtocolProposal>();

  /**
   * Submit a new protocol idea for incubation.
   * Returns the created ProtocolProposal (starts as 'experimental').
   */
  incubate(idea: {
    name: string;
    category: ProtocolProposal['category'];
    description: string;
    estimatedTVL?: number;
    estimatedUsers?: number;
    dependencies?: string[];
  }): ProtocolProposal {
    const proposal: ProtocolProposal = {
      id: crypto.randomUUID(),
      name: idea.name,
      category: idea.category,
      status: 'experimental',
      description: idea.description,
      estimatedTVL: idea.estimatedTVL,
      estimatedUsers: idea.estimatedUsers,
      dependencies: idea.dependencies ?? [],
      createdAt: Date.now(),
    };
    this.protocols.set(proposal.id, proposal);
    return proposal;
  }

  /**
   * Advance a protocol to the next lifecycle stage.
   * Returns the updated proposal.
   *
   * Transition rules:
   *  experimental  → incubating
   *  incubating    → validated
   *  validated     → launched
   *  any           → deprecated
   */
  advance(id: string): ProtocolProposal {
    const protocol = this.getOrThrow(id);
    const next = this.nextStatus(protocol.status);
    const updated: ProtocolProposal = { ...protocol, status: next };
    this.protocols.set(id, updated);
    return updated;
  }

  /** Deprecate a protocol at any lifecycle stage. */
  deprecate(id: string): ProtocolProposal {
    const protocol = this.getOrThrow(id);
    const updated: ProtocolProposal = { ...protocol, status: 'deprecated' };
    this.protocols.set(id, updated);
    return updated;
  }

  // ── Query helpers ──────────────────────────────────────────────────────────

  get(id: string): ProtocolProposal | undefined {
    return this.protocols.get(id);
  }

  listAll(): ProtocolProposal[] {
    return [...this.protocols.values()];
  }

  listByStatus(status: ProtocolProposal['status']): ProtocolProposal[] {
    return [...this.protocols.values()].filter((p) => p.status === status);
  }

  listByCategory(category: ProtocolProposal['category']): ProtocolProposal[] {
    return [...this.protocols.values()].filter((p) => p.category === category);
  }

  /** Returns protocols ready for final launch review. */
  get validatedProtocols(): ProtocolProposal[] {
    return this.listByStatus('validated');
  }

  /** Returns all active (non-deprecated) protocols. */
  get activeProtocols(): ProtocolProposal[] {
    return [...this.protocols.values()].filter((p) => p.status !== 'deprecated');
  }

  get size(): number {
    return this.protocols.size;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private nextStatus(current: ProtocolProposal['status']): ProtocolProposal['status'] {
    const map: Record<ProtocolProposal['status'], ProtocolProposal['status']> = {
      experimental: 'incubating',
      incubating: 'validated',
      validated: 'launched',
      launched: 'launched',    // terminal
      deprecated: 'deprecated', // terminal
    };
    return map[current];
  }

  private getOrThrow(id: string): ProtocolProposal {
    const p = this.protocols.get(id);
    if (!p) throw new Error(`protocol_not_found:${id}`);
    return p;
  }
}

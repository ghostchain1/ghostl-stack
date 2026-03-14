import crypto from 'node:crypto';
import type { Treaty, TreatyType, TreatyTerms } from '../types.js';

interface SignInput {
  type: TreatyType;
  parties: string[];
  terms: TreatyTerms;
}

/**
 * GhostTreatyEngine — cross-chain agreement registry and lifecycle manager.
 *
 * Stores the full lifecycle of every treaty: proposed → active → expired /
 * violated / terminated. Provides breach detection, renewal eligibility checks,
 * and summary reporting for the ConsciousnessCore.
 *
 * In a live system each treaty would be backed by on-chain multisig or a
 * bridge governance contract; here the engine models the off-chain coordination
 * layer that triggers those on-chain transactions.
 */
export class GhostTreatyEngine {
  private readonly treaties = new Map<string, Treaty>();

  /** Sign and activate a new treaty. Returns the persisted Treaty. */
  sign(input: SignInput): Treaty {
    const treaty: Treaty = {
      id: crypto.randomUUID(),
      type: input.type,
      parties: input.parties,
      terms: input.terms,
      status: 'active',
      signedAt: Date.now(),
      expiresAt: input.terms.duration ? Date.now() + input.terms.duration : undefined,
    };
    this.treaties.set(treaty.id, treaty);
    return treaty;
  }

  /** Mark a treaty as terminated by mutual agreement. */
  terminate(treatyId: string, reason = 'mutual_termination'): Treaty {
    const treaty = this.getOrThrow(treatyId);
    const updated: Treaty = { ...treaty, status: 'terminated' };
    this.treaties.set(treatyId, updated);
    return updated;
  }

  /** Flag a treaty as violated. */
  flagViolation(treatyId: string): Treaty {
    const treaty = this.getOrThrow(treatyId);
    const updated: Treaty = { ...treaty, status: 'violated' };
    this.treaties.set(treatyId, updated);
    return updated;
  }

  /**
   * Run expiry checks against all active treaties.
   * Returns the list of treaties that were transitioned to 'expired'.
   */
  pruneExpired(): Treaty[] {
    const now = Date.now();
    const expired: Treaty[] = [];
    for (const [id, treaty] of this.treaties) {
      if (treaty.status === 'active' && treaty.expiresAt != null && now >= treaty.expiresAt) {
        const updated: Treaty = { ...treaty, status: 'expired' };
        this.treaties.set(id, updated);
        expired.push(updated);
      }
    }
    return expired;
  }

  /** Renew a treaty by extending its expiry by another duration. */
  renew(treatyId: string, additionalDurationMs: number): Treaty {
    const treaty = this.getOrThrow(treatyId);
    const base = treaty.expiresAt ?? Date.now();
    const updated: Treaty = {
      ...treaty,
      status: 'active',
      expiresAt: base + additionalDurationMs,
      terms: {
        ...treaty.terms,
        duration: (treaty.terms.duration ?? 0) + additionalDurationMs,
      },
    };
    this.treaties.set(treatyId, updated);
    return updated;
  }

  // ── Query API ─────────────────────────────────────────────────────────────

  get(treatyId: string): Treaty | undefined {
    return this.treaties.get(treatyId);
  }

  listActive(): Treaty[] {
    this.pruneExpired();
    return [...this.treaties.values()].filter((t) => t.status === 'active');
  }

  listAll(): Treaty[] {
    return [...this.treaties.values()];
  }

  listByChain(chainId: string): Treaty[] {
    return [...this.treaties.values()].filter((t) => t.parties.includes(chainId));
  }

  get activeCount(): number {
    return this.listActive().length;
  }

  /** Summary report for telemetry / dashboard. */
  summary(): {
    total: number;
    active: number;
    expired: number;
    violated: number;
    terminated: number;
  } {
    this.pruneExpired();
    const all = [...this.treaties.values()];
    return {
      total: all.length,
      active: all.filter((t) => t.status === 'active').length,
      expired: all.filter((t) => t.status === 'expired').length,
      violated: all.filter((t) => t.status === 'violated').length,
      terminated: all.filter((t) => t.status === 'terminated').length,
    };
  }

  private getOrThrow(id: string): Treaty {
    const treaty = this.treaties.get(id);
    if (!treaty) throw new Error(`treaty_not_found:${id}`);
    return treaty;
  }
}

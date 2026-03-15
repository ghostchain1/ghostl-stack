/**
 * GhostChain Universal Identity — Identity Service
 *
 * Public façade that coordinates username registration, profile management,
 * reputation scoring, and creator verification.
 *
 * Consumed by:
 *   • apps/litvyblive/backend/src/routes/identity.ts  (REST API)
 *   • Any future GhostStack service that needs identity resolution
 *
 * All LitVybzLive micro-transactions occur on GhostL3 (chain_id 903).
 * L1 anchoring (chain_id 14000101) is record-keeping only and is triggered
 * explicitly via `recordL1Anchor()` after a successful GhostIdentity.sol
 * `register()` transaction is confirmed on GhostChain L1.
 */

import type Database from 'better-sqlite3';

import {
  registerUsername,
  linkWallet,
  resolveUsername,
  resolveWallet,
  usernameExists,
  toGhostHandle,
  type GhostUsername,
} from './username_registry.js';

import {
  getProfile,
  upsertProfile,
  setL1Anchor,
  type GhostProfile,
  type UpdateProfilePayload,
} from './profile_manager.js';

import {
  computeReputation,
  saveReputation,
  getSavedReputation,
  type ReputationScore,
} from './reputation_engine.js';

import {
  checkEligibility,
  submitVerificationRequest,
  reviewVerification,
  getVerificationStatus,
  listPendingRequests,
  type EligibilityCheck,
  type VerificationRequest,
} from './identity_verifier.js';

export type {
  GhostUsername,
  GhostProfile,
  UpdateProfilePayload,
  ReputationScore,
  EligibilityCheck,
  VerificationRequest,
};

export class IdentityService {
  constructor(private readonly db: Database.Database) {}

  // ── Username ────────────────────────────────────────────────────────────────

  /**
   * Claim a new ghost handle for an existing user (created via auth/register).
   * Returns the fully resolved GhostUsername on success.
   *
   * @throws if the username format is invalid or already taken.
   */
  claimUsername(
    userId: string,
    username: string,
    walletAddress: string | null,
  ): GhostUsername {
    registerUsername(this.db, userId, username, walletAddress);
    return resolveUsername(this.db, username)!;
  }

  /**
   * Link a GhostWallet address to an existing identity.
   * The wallet must not be associated with any other user.
   */
  linkWallet(userId: string, walletAddress: string): void {
    linkWallet(this.db, userId, walletAddress);
  }

  lookupByUsername(username: string): GhostUsername | null {
    return resolveUsername(this.db, username);
  }

  lookupByWallet(wallet: string): GhostUsername | null {
    return resolveWallet(this.db, wallet);
  }

  isAvailable(username: string): boolean {
    return !usernameExists(this.db, username);
  }

  ghostHandle(username: string): string {
    return toGhostHandle(username);
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  getProfile(userId: string): GhostProfile | null {
    return getProfile(this.db, userId);
  }

  updateProfile(userId: string, payload: UpdateProfilePayload): GhostProfile {
    upsertProfile(this.db, userId, payload);
    const profile = getProfile(this.db, userId);
    if (!profile) throw new Error('User not found.');
    return profile;
  }

  /**
   * Persist the GhostChain L1 anchor tx-hash after a successful
   * `GhostIdentity.register()` on-chain call.
   */
  recordL1Anchor(userId: string, txHash: string): void {
    setL1Anchor(this.db, userId, txHash);
  }

  // ── Reputation ──────────────────────────────────────────────────────────────

  /**
   * Recompute and persist the reputation score.  Callers should invoke this
   * whenever a relevant metric changes (gift sent, stream ended, follower gained).
   */
  refreshReputation(userId: string): ReputationScore {
    const score = computeReputation(this.db, userId);
    saveReputation(this.db, score);
    return score;
  }

  /** Return the last persisted score without recomputing. */
  getCachedReputation(
    userId: string,
  ): ReturnType<typeof getSavedReputation> {
    return getSavedReputation(this.db, userId);
  }

  // ── Verification ────────────────────────────────────────────────────────────

  checkEligibility(userId: string): EligibilityCheck {
    return checkEligibility(this.db, userId);
  }

  requestVerification(userId: string): void {
    submitVerificationRequest(this.db, userId);
  }

  /**
   * Approve or reject a pending verification (admin / GhostBrain governor only).
   */
  reviewVerification(userId: string, approved: boolean, note: string): void {
    reviewVerification(this.db, userId, approved, note);
  }

  getVerificationStatus(userId: string): VerificationRequest | null {
    return getVerificationStatus(this.db, userId);
  }

  listPendingVerifications(): Array<{ userId: string; requestedAt: string }> {
    return listPendingRequests(this.db);
  }
}

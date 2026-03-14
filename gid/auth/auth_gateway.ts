/**
 * GhostChain Sovereign Identity Network — Auth Gateway
 *
 * Wallet-based authentication using ECDSA challenge-response.
 *
 * Flow:
 *   1. Client calls `createChallenge(wallet)` → receives a random nonce.
 *   2. Client signs the nonce using their private key (EVM personal_sign
 *      format: "\x19GhostChain Signed Message:\n32" prefix).
 *   3. Client posts `wallet + nonce + signature` to `verifyChallenge()`.
 *   4. On success, an `AuthSession` is issued and stored.
 *   5. Sessions expire after SESSION_TTL_S seconds.
 *
 * Signature verification:
 *   The gateway accepts a pluggable `SignatureVerifier` function injected at
 *   construction time.  In production this should be backed by ghost-sdk-core
 *   (no-ethers path) or ghost-sdk (ethers v6 wrapped).
 *   This keeps the auth-gateway free of hard crypto dependencies and trivially
 *   testable.
 *
 * Rate limiting:
 *   Each wallet is limited to MAX_CHALLENGES_PER_WINDOW challenge requests
 *   within RATE_WINDOW_MS.  Excessive requests return `RateLimitError`.
 *
 * Advisory-only:
 *   The gateway issues in-memory sessions only.  No autonomous on-chain
 *   writes.  Successful auth events are forwarded to GhostBrain Core (:7900)
 *   for identity graph correlation.
 *
 * Chain: GhostChain L1 (chain_id 14000101).
 * Gas token: GST.
 */

import { randomBytes } from "node:crypto";

// ── Constants ────────────────────────────────────────────────────────────────

const L1_CHAIN_ID = 14000101;

const CHALLENGE_TTL_S         = parseInt(process.env["GID_CHALLENGE_TTL_S"]  ?? "300", 10);
const SESSION_TTL_S           = parseInt(process.env["GID_SESSION_TTL_S"]    ?? "3600", 10);
const MAX_CHALLENGES          = 10_000;   // Total in-flight challenges
const MAX_SESSIONS            = 10_000;   // Total held sessions
const MAX_CHALLENGES_PER_WIN  = 5;        // Per-wallet per rate window
const RATE_WINDOW_MS          = 60_000;   // 1 minute

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Injected ECDSA verifier.
 *
 * Receives the raw wallet address, the nonce bytes (hex-encoded), and the
 * hex-encoded 65-byte signature produced by `personal_sign`.
 * Must return `true` iff the recovered signer equals `wallet`.
 *
 * Production implementation: use ghost-sdk-core's `recoverPersonalSign`
 * utility which wraps the EVM personal_sign "\x19..." prefix hashing and secp256k1
 * recovery without external dependencies.
 *
 * @example
 * ```ts
 * import { recoverPersonalSign } from "ghost-sdk-core";
 * const gateway = new AuthGateway({ verifier: recoverPersonalSign });
 * ```
 */
export type SignatureVerifier = (
  wallet:    string,
  nonce:     string,  // hex-encoded 32-byte random nonce
  signature: string,  // hex-encoded 65-byte ECDSA signature (r+s+v)
) => Promise<boolean>;

export interface AuthChallenge {
  wallet:    string;
  nonce:     string;    // 32-byte hex nonce
  issuedAt:  number;    // Unix seconds
  expiresAt: number;    // Unix seconds
}

export interface AuthSession {
  sessionId:  string;
  wallet:     string;
  username?:  string;
  issuedAt:   number;   // Unix seconds
  expiresAt:  number;   // Unix seconds
}

export interface AuthGatewayOptions {
  verifier?:         SignatureVerifier;
  ghostbrainUrl?:    string;
  challengeTtlS?:    number;
  sessionTtlS?:      number;
  /** Injected fetch (defaults to global fetch). */
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message:         string,
    public readonly code: AuthErrorCode,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthErrorCode =
  | "INVALID_WALLET"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "SIGNATURE_INVALID"
  | "RATE_LIMITED"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED";

// ── AuthGateway ───────────────────────────────────────────────────────────────

export class AuthGateway {
  private readonly verifier:       SignatureVerifier;
  private readonly ghostbrainUrl:  string;
  private readonly challengeTtlS:  number;
  private readonly sessionTtlS:    number;
  private readonly fetcher:         (url: string, init?: RequestInit) => Promise<Response>;

  /** wallet → pending challenge */
  private readonly challenges = new Map<string, AuthChallenge>();

  /** sessionId → session */
  private readonly sessions = new Map<string, AuthSession>();

  /** wallet → { count, windowStartMs } for rate limiting */
  private readonly rateLimiters = new Map<string, { count: number; windowStartMs: number }>();

  constructor(opts: AuthGatewayOptions = {}) {
    this.verifier      = opts.verifier      ?? AuthGateway._defaultVerifier;
    this.ghostbrainUrl = opts.ghostbrainUrl ?? GHOSTBRAIN_URL;
    this.challengeTtlS = opts.challengeTtlS ?? CHALLENGE_TTL_S;
    this.sessionTtlS   = opts.sessionTtlS   ?? SESSION_TTL_S;
    this.fetcher       = opts.fetcher       ?? ((url, init) => fetch(url, init));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create and return a fresh challenge nonce for the given wallet.
   * Overwrites any existing pending challenge for this wallet.
   *
   * @throws AuthError RATE_LIMITED — if wallet exceeds rate window limit.
   * @throws AuthError INVALID_WALLET — if address format is invalid.
   */
  createChallenge(wallet: string): AuthChallenge {
    const addr = AuthGateway._validateAddress(wallet);
    this._checkRateLimit(addr);
    this._evictChallenges();

    const nonce     = randomBytes(32).toString("hex");
    const nowSec    = AuthGateway._nowSec();
    const challenge: AuthChallenge = {
      wallet:    addr,
      nonce,
      issuedAt:  nowSec,
      expiresAt: nowSec + this.challengeTtlS,
    };

    this.challenges.set(addr, challenge);
    return challenge;
  }

  /**
   * Verify a signature against the outstanding challenge for `wallet`.
   * On success, creates and returns an AuthSession.
   *
   * @throws AuthError CHALLENGE_NOT_FOUND — no pending challenge.
   * @throws AuthError CHALLENGE_EXPIRED   — challenge TTL elapsed.
   * @throws AuthError SIGNATURE_INVALID   — recovered signer mismatch.
   */
  async verifyChallenge(
    wallet:    string,
    signature: string,
    username?: string,
  ): Promise<AuthSession> {
    const addr      = AuthGateway._validateAddress(wallet);
    const challenge = this.challenges.get(addr);

    if (!challenge) throw new AuthError("No pending challenge for wallet", "CHALLENGE_NOT_FOUND");
    if (AuthGateway._nowSec() > challenge.expiresAt)
      throw new AuthError("Challenge expired", "CHALLENGE_EXPIRED");

    const valid = await this.verifier(addr, challenge.nonce, signature);
    if (!valid) throw new AuthError("Signature verification failed", "SIGNATURE_INVALID");

    // Challenge consumed — remove to prevent replay.
    this.challenges.delete(addr);

    const session = this._issueSession(addr, username);
    void this._notifyGhostBrain(session);
    return session;
  }

  /**
   * Look up an active session by ID.
   * @throws AuthError SESSION_NOT_FOUND or SESSION_EXPIRED.
   */
  getSession(sessionId: string): AuthSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new AuthError("Session not found", "SESSION_NOT_FOUND");
    if (AuthGateway._nowSec() > session.expiresAt) {
      this.sessions.delete(sessionId);
      throw new AuthError("Session expired", "SESSION_EXPIRED");
    }
    return session;
  }

  /** Revoke a session explicitly (logout). */
  revokeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // ── Internal — Session ─────────────────────────────────────────────────────

  private _issueSession(wallet: string, username?: string): AuthSession {
    this._evictSessions();

    const sessionId  = randomBytes(32).toString("hex");
    const nowSec     = AuthGateway._nowSec();
    const session: AuthSession = {
      sessionId,
      wallet,
      username,
      issuedAt:  nowSec,
      expiresAt: nowSec + this.sessionTtlS,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  // ── Internal — Rate Limiting ───────────────────────────────────────────────

  private _checkRateLimit(wallet: string): void {
    const now    = Date.now();
    const bucket = this.rateLimiters.get(wallet);

    if (!bucket || now - bucket.windowStartMs > RATE_WINDOW_MS) {
      this.rateLimiters.set(wallet, { count: 1, windowStartMs: now });
      return;
    }

    if (bucket.count >= MAX_CHALLENGES_PER_WIN) {
      throw new AuthError("Too many challenge requests for this wallet", "RATE_LIMITED");
    }

    bucket.count += 1;
  }

  // ── Internal — Eviction ────────────────────────────────────────────────────

  private _evictChallenges(): void {
    if (this.challenges.size < MAX_CHALLENGES) return;
    const nowSec = AuthGateway._nowSec();
    for (const [addr, ch] of this.challenges) {
      if (nowSec > ch.expiresAt) this.challenges.delete(addr);
      if (this.challenges.size < MAX_CHALLENGES) break;
    }
    // Hard evict oldest if still full.
    if (this.challenges.size >= MAX_CHALLENGES) {
      const first = this.challenges.keys().next().value;
      if (first !== undefined) this.challenges.delete(first);
    }
  }

  private _evictSessions(): void {
    if (this.sessions.size < MAX_SESSIONS) return;
    const nowSec = AuthGateway._nowSec();
    for (const [id, s] of this.sessions) {
      if (nowSec > s.expiresAt) this.sessions.delete(id);
      if (this.sessions.size < MAX_SESSIONS) break;
    }
    if (this.sessions.size >= MAX_SESSIONS) {
      const first = this.sessions.keys().next().value;
      if (first !== undefined) this.sessions.delete(first);
    }
  }

  // ── Internal — GhostBrain Notification ────────────────────────────────────

  private async _notifyGhostBrain(session: AuthSession): Promise<void> {
    const payload: AuthEvent = {
      event_type: "wallet_authenticated",
      wallet:     session.wallet,
      username:   session.username,
      session_id: session.sessionId,
      chain_id:   L1_CHAIN_ID,
      gas_token:  "GST",
      timestamp:  session.issuedAt,
    };

    try {
      const res = await this.fetcher(`${this.ghostbrainUrl}/gid/auth-event`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error)
        console.error("[AuthGateway] GhostBrain notification failed:", err.message);
    }
  }

  // ── Internal — Helpers ─────────────────────────────────────────────────────

  private static _nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  private static _validateAddress(address: string): string {
    const trimmed = address.trim();
    // Basic 0x-prefixed 20-byte hex address check.
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed))
      throw new AuthError(`Invalid wallet address: ${trimmed}`, "INVALID_WALLET");
    return trimmed.toLowerCase();
  }

  /**
   * Default no-op verifier that always returns false.
   * Production deployments MUST inject a real verifier via AuthGatewayOptions.
   */
  private static async _defaultVerifier(
    _wallet:    string,
    _nonce:     string,
    _signature: string,
  ): Promise<boolean> {
    console.warn(
      "[AuthGateway] No SignatureVerifier injected — using reject-all default. " +
      "Inject ghost-sdk-core recoverPersonalSign for production use.",
    );
    return false;
  }
}

// ── GhostBrain API Shapes ─────────────────────────────────────────────────────

interface AuthEvent {
  event_type: string;
  wallet:     string;
  username?:  string;
  session_id: string;
  chain_id:   number;
  gas_token:  string;
  timestamp:  number;
}

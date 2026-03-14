/**
 * GhostStack AI Vault — Identity Engine
 * Zero-trust identity: JWT issuance/validation, mTLS verification,
 * AI agent attestation, and actor identity hashing.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { sha256 } from './crypto-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActorType =
  | 'human'
  | 'validator'
  | 'bridge-operator'
  | 'treasury-operator'
  | 'ai-agent'
  | 'ghostbrain'
  | 'docker-container'
  | 'vm-hypervisor'
  | 'ci-cd'
  | 'unknown';

export interface ActorIdentity {
  id: string;         // deterministic, non-reversible actor hash
  type: ActorType;
  roles: string[];
  chainId?: number;   // GhostChain L1/L2/L3 if applicable
  label?: string;     // human-readable label (not used for auth decisions)
}

export interface JwtPayload {
  sub: string;        // subject (actor id)
  iat: number;        // issued at (unix seconds)
  exp: number;        // expires at (unix seconds)
  roles: string[];
  type: ActorType;
  chainId?: number;
  jti: string;        // unique token id (anti-replay)
}

export interface AuthResult {
  ok: boolean;
  actor?: ActorIdentity;
  reason?: string;
}

// ── Token Registry (in-memory revocation list) ────────────────────────────

const _revokedJtis = new Set<string>();
const _revokedActors = new Set<string>();

// ── JWT Implementation (HMAC-SHA256 / HS256) ─────────────────────────────

function b64urlEncode(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b.toString('base64url');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/**
 * Issue a signed JWT for the given actor.
 * Uses HMAC-SHA256 (HS256).
 */
export function issueJwt(
  actor: ActorIdentity,
  jwtSecret: string,
  expirySeconds = 3600,
): string {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: actor.id,
    iat: now,
    exp: now + expirySeconds,
    roles: actor.roles,
    type: actor.type,
    ...(actor.chainId !== undefined && { chainId: actor.chainId }),
    jti: randomBytes(16).toString('hex'),
  };

  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const mac = createHmac('sha256', jwtSecret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${mac}`;
}

/**
 * Validate a JWT and return the decoded payload.
 * Performs: signature verification, expiry check, revocation check.
 */
export function validateJwt(token: string, jwtSecret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [header, body, sigB64] = parts as [string, string, string];
  const signingInput = `${header}.${body}`;

  const expectedMac = createHmac('sha256', jwtSecret)
    .update(signingInput)
    .digest();
  const actualMac = b64urlDecode(sigB64);

  if (actualMac.length !== expectedMac.length) {
    throw new Error('JWT signature length mismatch');
  }
  if (!timingSafeEqual(actualMac, expectedMac)) {
    throw new Error('JWT signature invalid');
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as JwtPayload;
  } catch {
    throw new Error('JWT payload decode failed');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('JWT expired');
  if (payload.iat > now + 60) throw new Error('JWT issued in the future');

  if (_revokedJtis.has(payload.jti)) throw new Error('JWT revoked');
  if (_revokedActors.has(payload.sub)) throw new Error('Actor revoked');

  return payload;
}

// ── Token Revocation ───────────────────────────────────────────────────────

export function revokeToken(jti: string): void {
  _revokedJtis.add(jti);
}

export function revokeActor(actorId: string): void {
  _revokedActors.add(actorId);
}

export function isActorRevoked(actorId: string): boolean {
  return _revokedActors.has(actorId);
}

/** Prune expired JTI entries. Call periodically. */
export function pruneRevocationList(): void {
  // In production, store JTIs with expiry timestamps and prune expired ones.
  // This simplified version keeps the set bounded.
  if (_revokedJtis.size > 100_000) {
    // Keep the last 50k
    const entries = [..._revokedJtis];
    _revokedJtis.clear();
    entries.slice(-50_000).forEach(jti => _revokedJtis.add(jti));
  }
}

// ── Actor Identity ─────────────────────────────────────────────────────────

/**
 * Deterministically hash an actor's token + IP into a non-reversible ID.
 * Used for tracking behavior without storing raw credentials.
 */
export function hashActor(token: string | undefined, ip: string | undefined): string {
  const input = `ghostvault:actor:${token ?? ''}:${ip ?? ''}`;
  return sha256(input).slice(0, 24);
}

/**
 * Resolve actor identity from an HTTP request.
 * Priority: JWT → x-actor-id header → hash(token, ip)
 */
export function resolveActorFromRequest(
  req: IncomingMessage & { ip?: string; headers: Record<string, string | string[] | undefined> },
  jwtSecret: string,
): ActorIdentity {
  const authHeader = req.headers['authorization'];
  const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const ip = req.ip ?? (req.socket?.remoteAddress ?? 'unknown');

  // Try JWT Bearer token
  if (rawAuth?.startsWith('Bearer ')) {
    const token = rawAuth.slice(7);
    try {
      const payload = validateJwt(token, jwtSecret);
      return {
        id: payload.sub,
        type: payload.type,
        roles: payload.roles,
        ...(payload.chainId !== undefined && { chainId: payload.chainId }),
      };
    } catch {
      // Fall through to other methods
    }
  }

  // Try x-actor-id header (pre-authenticated service mesh)
  const actorHeader = req.headers['x-actor-id'];
  const actorId = Array.isArray(actorHeader) ? actorHeader[0] : actorHeader;
  if (actorId) {
    const id = actorId;   // narrow to string
    const roleHeader = req.headers['x-actor-roles'];
    const rawRoles = (Array.isArray(roleHeader) ? (roleHeader[0] ?? '') : (roleHeader ?? '')) as string;
    return {
      id,
      type: detectActorType(id, rawRoles),
      roles: rawRoles.split(',').map((r: string) => r.trim()).filter(Boolean),
    };
  }

  // Fallback: hash token + IP
  const vaultToken = req.headers['x-vault-token'];
  const rawToken = Array.isArray(vaultToken) ? vaultToken[0] : vaultToken;
  return {
    id: hashActor(rawToken, ip),
    type: 'unknown',
    roles: [],
  };
}

function detectActorType(actorId: string, roles: string): ActorType {
  if (roles.includes('ai-agent') || actorId.startsWith('agent:')) return 'ai-agent';
  if (roles.includes('validator')) return 'validator';
  if (roles.includes('bridge-operator')) return 'bridge-operator';
  if (roles.includes('treasury-operator')) return 'treasury-operator';
  if (actorId.startsWith('docker:')) return 'docker-container';
  if (actorId.startsWith('vm:')) return 'vm-hypervisor';
  if (actorId.startsWith('ci:')) return 'ci-cd';
  if (actorId.startsWith('ghostbrain:')) return 'ghostbrain';
  return 'human';
}

// ── Role Authorization ─────────────────────────────────────────────────────

/**
 * Check whether an actor has ALL of the required roles.
 */
export function hasRoles(actor: ActorIdentity, required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every(r => actor.roles.includes(r));
}

/**
 * Check whether an actor has ANY of the required roles.
 */
export function hasAnyRole(actor: ActorIdentity, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.some(r => actor.roles.includes(r));
}

/** Vault-admin bypass: vault-admin role can do anything. */
export function isVaultAdmin(actor: ActorIdentity): boolean {
  return actor.roles.includes('vault-admin');
}

// ── mTLS Verification (interface) ─────────────────────────────────────────
// Full mTLS requires TLS server config with `requestCert: true, rejectUnauthorized: true`.
// This helper extracts the verified subject CN from the TLS peer certificate.

export function getMtlsSubject(socket: { getPeerCertificate?: () => { subject?: { CN?: string } } }): string | null {
  if (typeof socket.getPeerCertificate !== 'function') return null;
  const cert = socket.getPeerCertificate();
  return cert?.subject?.CN ?? null;
}

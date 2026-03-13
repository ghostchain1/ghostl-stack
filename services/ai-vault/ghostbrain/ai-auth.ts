/**
 * GhostStack AI Vault — AI Agent Authentication
 *
 * Verifies AI agents via:
 *   1. Signed JWT  (primary path — issued by GhostBrain after ECDSA attestation)
 *   2. mTLS client certificate (secondary path — mutual TLS at transport layer)
 *   3. Hardware attestation token (tertiary — TPM/HSM-backed for L1 validators)
 *
 * All issued tokens are short-lived (60 s default).
 * Revocation is immediate through the shared token blocklist in identity-engine.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import {
  validateJwt,
  issueJwt,
  revokeToken,
  type ActorIdentity,
} from '../core/identity-engine.js';
import {
  isRegisteredAgent,
  agentCanAccessPath,
  agentCanPerformAction,
  getAgentRegistration,
  type AiAgentId,
  type AiAgentRegistration,
} from './ai-identity-registry.js';

// ── Config ─────────────────────────────────────────────────────────────────

const AI_TOKEN_TTL_SECONDS = Number(process.env['AI_TOKEN_TTL_SECONDS'] ?? 60);
const AI_HMAC_SECRET       = process.env['AI_AUTH_HMAC_SECRET'] ?? '';
const VAULT_JWT_SECRET     = process.env['JWT_SECRET'] ?? '';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AiAuthResult {
  ok:         boolean;
  identity?:  ActorIdentity;
  agentId?:   AiAgentId;
  reg?:       AiAgentRegistration;
  error?:     string;
}

export interface TokenIssuanceOpts {
  agentId:      AiAgentId;
  /** Shared HMAC secret, used to authenticate the issuance request */
  callerHmac:   string;
  /** Nonce from caller to mix into payload (prevents replay) */
  nonce:        string;
}

export interface AttestationTicket {
  /** The agent making the attestation call */
  agentId:      string;
  /** TPM/HSM quote blob (hex) */
  quoteHex:     string;
  /** PCR bank digest (hex) proving firmware state) */
  pcrDigest:    string;
  /** Timestamp of attestation (unix ms) — must be within ±5 s */
  ts:           number;
}

// ── HMAC Verification ──────────────────────────────────────────────────────

/**
 * Verify a caller-supplied HMAC(secret, payload).
 * Timing-safe comparison prevents oracle attacks.
 */
function verifyHmac(secret: string, payload: string, suppliedHmac: string): boolean {
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(suppliedHmac.padEnd(expected.length, '0').slice(0, expected.length), 'hex'),
    );
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Issue a short-lived vault JWT for a registered AI agent.
 *
 * The caller must prove knowledge of `AI_AUTH_HMAC_SECRET` by providing:
 *   HMAC-SHA256(AI_AUTH_HMAC_SECRET, `${agentId}:${nonce}`)
 */
export async function issueAgentToken(opts: TokenIssuanceOpts): Promise<string> {
  if (!isRegisteredAgent(opts.agentId)) {
    throw new Error(`Unknown AI agent: ${opts.agentId}`);
  }
  const payload = `${opts.agentId}:${opts.nonce}`;
  if (!verifyHmac(AI_HMAC_SECRET, payload, opts.callerHmac)) {
    throw new Error('HMAC verification failed — invalid AI_AUTH_HMAC_SECRET or nonce');
  }
  const reg = getAgentRegistration(opts.agentId);
  const identity: ActorIdentity = {
    id:    reg.id,
    type:  reg.actorType,
    roles: reg.roles,
  };
  return issueJwt(identity, VAULT_JWT_SECRET, AI_TOKEN_TTL_SECONDS);
}

/**
 * Validate a JWT presented by an AI agent and return its full identity +
 * registration record.
 *
 * Returns `{ ok: false, error }` for any failure — never throws.
 */
export async function verifyAgentToken(token: string): Promise<AiAuthResult> {
  try {
    const payload = validateJwt(token, VAULT_JWT_SECRET);

    const agentId = payload.sub;
    if (!isRegisteredAgent(agentId)) {
      return { ok: false, error: `Token subject '${agentId}' is not a registered AI agent` };
    }

    const reg = getAgentRegistration(agentId);
    const identity: ActorIdentity = {
      id:    agentId,
      type:  reg.actorType,
      roles: reg.roles,
      ...(reg.chainIds?.[0] !== undefined && { chainId: reg.chainIds[0] }),
    };

    return { ok: true, identity, agentId, reg };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Validate a hardware attestation ticket (TPM/HSM-backed).
 * In production, replace the placeholder digest check with a real
 * TPM quote verification library or HSM SDK call.
 */
export async function verifyHardwareAttestation(
  ticket: AttestationTicket,
): Promise<AiAuthResult> {
  const now = Date.now();
  if (Math.abs(now - ticket.ts) > 5_000) {
    return { ok: false, error: 'Attestation timestamp outside 5 s window' };
  }

  if (!isRegisteredAgent(ticket.agentId)) {
    return { ok: false, error: `Unknown AI agent: ${ticket.agentId}` };
  }

  // TODO: Replace with real TPM 2.0 quote verification
  const quoteValid = ticket.quoteHex.length >= 128 && ticket.pcrDigest.length === 64;
  if (!quoteValid) {
    return { ok: false, error: 'Hardware attestation quote failed verification' };
  }

  const reg = getAgentRegistration(ticket.agentId as AiAgentId);
  const identity: ActorIdentity = {
    id:    ticket.agentId,
    type:  reg.actorType,
    roles: reg.roles,
  };

  const nonce    = randomBytes(16).toString('hex');
  const jwtToken  = await issueAgentToken({
    agentId:    ticket.agentId as AiAgentId,
    callerHmac: createHmac('sha256', AI_HMAC_SECRET).update(`${ticket.agentId}:${nonce}`).digest('hex'),
    nonce,
  });

  // Embed token in the result for the caller to store and use
  return { ok: true, identity, agentId: ticket.agentId as AiAgentId, reg, error: jwtToken };
}

/**
 * Check whether the authenticated agent is allowed to access a vault path
 * and perform a given action.
 */
export function authorizeAgentAction(
  authResult: AiAuthResult,
  vaultPath: string,
  action: AiAgentRegistration['allowedActions'][number],
): boolean {
  if (!authResult.ok || !authResult.agentId) return false;
  return (
    agentCanAccessPath(authResult.agentId, vaultPath) &&
    agentCanPerformAction(authResult.agentId, action)
  );
}

/** Immediately revoke an AI agent's token (e.g., on detected compromise). */
export function revokeAgentToken(jti: string): void {
  revokeToken(jti);
}

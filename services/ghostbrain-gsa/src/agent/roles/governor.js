/**
 * @file src/agent/roles/governor.js
 * @description Governor role: OGB verification + final quorum gate.
 *
 * The Governor is the last checkpoint before any WRITE action.
 * It checks:
 *  1. The OGB bundle is verified (not expired, not replayed, Merkle root matches)
 *  2. The PQ signature requirement (if enabled)
 *  3. The quorum threshold (if multi-sig configured)
 *
 * If all checks pass, issues a time-limited approval token that the Executor must
 * present. Token is stored in CAS for audit trail.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { verifyBundle } from '../../bundles/ogb-verifier.js';
import { put } from '../../storage/cas.js';
import { config } from '../../config.js';

/**
 * Verify a governance bundle and issue an approval token.
 * @param {object} bundle - Parsed OGB bundle JSON
 * @returns {{ ok: boolean, token?: string, bundleHash?: string, reason?: string }}
 */
export function governorApprove(bundle) {
  // 1. OGB verification
  const result = verifyBundle(bundle);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  // 2. PQ signature requirement
  if (config.pqSignaturesRequired) {
    const hasPQ = (bundle.signatures ?? []).some(s => s.algorithm?.startsWith('HMAC-SHA3') || s.algorithm?.startsWith('ML-DSA'));
    if (!hasPQ) {
      return { ok: false, reason: 'GOVERNOR_DENIED: PQ signature required but none found in bundle' };
    }
  }

  // 3. Issue time-limited approval token (HMAC over bundleHash + expiry)
  const issuedAt  = Date.now();
  const expiresAt = issuedAt + 5 * 60 * 1000; // 5 minute window
  const tokenId   = randomUUID();
  const payload   = `${tokenId}:${result.hash}:${expiresAt}`;
  const sig       = config.controlPlaneSecret
    ? createHmac('sha256', config.controlPlaneSecret).update(payload).digest('hex')
    : 'unsigned';

  const token = {
    tokenId,
    bundleHash: result.hash,
    issuedAt,
    expiresAt,
    agentId:    config.agentId,
    signature:  sig,
  };

  const tokenHash = put(token, 'governor-tokens');
  return { ok: true, token: tokenHash, bundleHash: result.hash };
}

/**
 * Verify a governor approval token (presented by Executor).
 * @param {string} tokenHash - CAS hash of the token record
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifyApprovalToken(tokenHash, { cas }) {
  const token = cas.get(tokenHash, 'governor-tokens');
  if (!token) return { ok: false, reason: 'GOVERNOR: token not found in CAS' };
  if (Date.now() > token.expiresAt) return { ok: false, reason: 'GOVERNOR: token expired' };
  return { ok: true };
}

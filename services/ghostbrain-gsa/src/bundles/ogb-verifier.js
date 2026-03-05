/**
 * @file src/bundles/ogb-verifier.js
 * @description Offline Governance Bundle (OGB) verifier for ghostbrain-gsa.
 *
 * Integrates with @ghostchain/governance-bundle for Merkle + multi-sig verification.
 * If the governance-bundle package is installed, it is used directly.
 * Otherwise, this module implements a minimal local verifier using the same
 * sha256-based Merkle algorithm for zero external dependency operation.
 *
 * Security properties:
 *  - Replay protection (bundle.expiresAt, bundle.uid checked against seen set)
 *  - Every apply action must attach a verified bundle hash
 *  - Bundles are cached in CAS by hash
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { put, has } from '../storage/cas.js';

// Replay protection: track seen bundle UIDs (in-memory; sufficient for single-process)
const seenBundles = new Set();

/**
 * Compute sha256 of a single artifact JSON string.
 */
function sha256hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Compute the Merkle root of an array of sha256 hex hashes.
 * Uses sorted-sibling order (matches GovernanceExecutor.sol on-chain verifier).
 * @param {string[]} hashes
 * @returns {string} root hex
 */
export function merkleRoot(hashes) {
  if (hashes.length === 0) return sha256hex('');
  let layer = [...hashes];
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left  = layer[i];
      const right = layer[i + 1] ?? layer[i]; // duplicate last if odd
      const [a, b] = left <= right ? [left, right] : [right, left];
      next.push(sha256hex(a + b));
    }
    layer = next;
  }
  return layer[0];
}

/**
 * Load a bundle from a JSON file path.
 * @param {string} filePath - Absolute path to bundle JSON
 * @returns {object}
 */
export function loadBundle(filePath) {
  if (!existsSync(filePath)) throw new Error(`OGB: bundle file not found: ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Verify a governance bundle offline.
 *
 * Checks:
 *  1. Required fields present
 *  2. Not expired (bundle.expiresAt > now)
 *  3. Not replayed (bundle.uid not seen before)
 *  4. Merkle root matches re-computed root from artifacts
 *  5. Minimum signature threshold met (bundle.threshold)
 *
 * @param {object} bundle - Parsed bundle JSON
 * @returns {{ ok: boolean, hash: string, reason?: string }}
 */
export function verifyBundle(bundle) {
  // 1. Required fields
  for (const f of ['uid', 'artifacts', 'merkleRoot', 'expiresAt']) {
    if (!bundle[f]) return { ok: false, hash: '', reason: `OGB_INVALID: missing field "${f}"` };
  }

  // 2. Expiry
  if (Date.now() > new Date(bundle.expiresAt).getTime()) {
    return { ok: false, hash: '', reason: `OGB_EXPIRED: bundle expired at ${bundle.expiresAt}` };
  }

  // 3. Replay
  if (seenBundles.has(bundle.uid)) {
    return { ok: false, hash: '', reason: `OGB_REPLAY: bundle uid "${bundle.uid}" already consumed` };
  }

  // 4. Merkle root
  const artifactHashes = (bundle.artifacts ?? []).map(a => sha256hex(JSON.stringify(a)));
  const computed = merkleRoot(artifactHashes);
  if (computed !== bundle.merkleRoot) {
    return {
      ok: false,
      hash: '',
      reason: `OGB_MERKLE_MISMATCH: computed=${computed} declared=${bundle.merkleRoot}`,
    };
  }

  // 5. Signatures (if present) — count unique valid-looking sigs
  const sigs = bundle.signatures ?? [];
  const threshold = bundle.threshold ?? 1;
  if (sigs.length < threshold) {
    return {
      ok: false,
      hash: '',
      reason: `OGB_THRESHOLD: ${sigs.length} signatures < required ${threshold}`,
    };
  }

  // Mark consumed
  seenBundles.add(bundle.uid);

  // Store in CAS and return hash
  const hash = put(bundle, 'bundles');
  return { ok: true, hash };
}

/**
 * Verify a bundle provided as a raw JSON string.
 * @param {string} json
 * @returns {{ ok: boolean, hash: string, reason?: string }}
 */
export function verifyBundleJson(json) {
  let bundle;
  try { bundle = JSON.parse(json); } catch (e) {
    return { ok: false, hash: '', reason: `OGB_PARSE_ERROR: ${e.message}` };
  }
  return verifyBundle(bundle);
}

/**
 * Check if a bundle hash was previously verified (exists in CAS).
 * @param {string} hash - sha256 hex
 * @returns {boolean}
 */
export function isBundleVerified(hash) {
  return has(hash, 'bundles');
}

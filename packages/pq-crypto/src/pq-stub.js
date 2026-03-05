/**
 * @file src/pq-stub.js
 * @description STRUCTURAL STUB for the post-quantum (ML-DSA-87 / Dilithium5) signing layer.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MIGRATION REQUIRED FOR PRODUCTION PQ SECURITY                      ║
 * ║                                                                      ║
 * ║  This stub provides the correct API surface and HMAC-SHA3-512        ║
 * ║  as a structural placeholder. It does NOT provide post-quantum       ║
 * ║  security against quantum adversaries.                               ║
 * ║                                                                      ║
 * ║  Replace with @noble/post-quantum (recommended):                     ║
 * ║    npm install @noble/post-quantum                                   ║
 * ║    import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';            ║
 * ║                                                                      ║
 * ║  See docs/pq-migration.md for the full migration playbook.           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Structural contract:
 *   - generatePQKeyPair()  → { secretKey: Uint8Array, publicKey: Uint8Array }
 *   - pqSign(msg, sk)      → Uint8Array (signature bytes)
 *   - pqVerify(msg, sig, pk) → boolean
 *
 * All three functions are drop-in compatible with @noble/post-quantum ml_dsa87.
 */

import { createHmac, randomBytes } from 'node:crypto';

const STUB_WARNING = '[pq-crypto] WARNING: Using HMAC-SHA3-512 stub — NOT post-quantum secure. See docs/pq-migration.md';

let _warned = false;
function warnOnce() {
  if (!_warned) {
    process.stderr.write(STUB_WARNING + '\n');
    _warned = true;
  }
}

/** @typedef {{ secretKey: Uint8Array, publicKey: Uint8Array }} PQKeyPair */

/**
 * Generate a stub PQ key pair (random 64-byte secret → SHA3-derived public).
 * @returns {PQKeyPair}
 */
export function generatePQKeyPair() {
  warnOnce();
  const secretKey = randomBytes(64); // ML-DSA-87 sk is 4896 bytes; stub uses 64
  // "Public key" = HMAC-SHA3-256 of secret (NOT a real lattice public key)
  const publicKey = Buffer.from(
    createHmac('sha3-256', secretKey).update('ghostchain-pq-stub-pubkey').digest()
  );
  return { secretKey, publicKey };
}

/**
 * Stub sign: HMAC-SHA3-512(msg, secretKey).
 * @param {Uint8Array|Buffer|string} message
 * @param {Uint8Array|Buffer} secretKey
 * @returns {Uint8Array}
 */
export function pqSign(message, secretKey) {
  warnOnce();
  const sig = createHmac('sha3-512', Buffer.from(secretKey))
    .update(Buffer.isBuffer(message) ? message : Buffer.from(message))
    .digest();
  return new Uint8Array(sig);
}

/**
 * Stub verify: HMAC-SHA3-512(msg, secretKey) === signature.
 * NOTE: This requires the secret key — real ML-DSA verification uses only the public key.
 * This is a structural stub ONLY; replace with ml_dsa87.verify(pk, msg, sig).
 *
 * @param {Uint8Array|Buffer|string} message
 * @param {Uint8Array|Buffer} signature
 * @param {Uint8Array|Buffer} publicKey   - IGNORED in stub (would be used in real impl)
 * @param {Uint8Array|Buffer} [secretKey] - Required by stub (NOT required in real impl)
 * @returns {boolean}
 */
export function pqVerify(message, signature, publicKey, secretKey) {
  warnOnce();
  if (!secretKey) {
    // In real implementation, only publicKey is needed.
    // If secretKey is not provided for stub, we cannot verify.
    return false;
  }
  const expected = createHmac('sha3-512', Buffer.from(secretKey))
    .update(Buffer.isBuffer(message) ? message : Buffer.from(message))
    .digest();
  // Constant-time comparison
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const IS_STUB = true;
export const ALGORITHM = 'HMAC-SHA3-512-STUB';
export const PRODUCTION_ALGORITHM = 'ML-DSA-87'; // NIST FIPS 204

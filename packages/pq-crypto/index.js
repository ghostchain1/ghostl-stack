/**
 * @module @ghostchain/pq-crypto
 * @description Hybrid (classical + post-quantum) cryptography for GhostChain.
 *
 * Hybrid signing combines:
 *   1. Ed25519 (classical, 128-bit security)
 *   2. ML-DSA-87 / Dilithium5 (post-quantum, NIST FIPS 204, 256-bit PQ security)
 *      → currently a HMAC-SHA3-512 structural stub (see src/pq-stub.js)
 *
 * A hybrid signature is valid if and only if BOTH classical AND PQ signatures verify.
 * This provides:
 *   - Full classical security today (Ed25519)
 *   - Full PQ security when the PQ layer is replaced with ml_dsa87
 *   - No reduction in security if either layer is stronger
 *
 * API:
 *   generateHybridKeyPair()           → { classical, pq }
 *   hybridSign(message, keyPair)      → HybridSignature
 *   hybridVerify(message, sig, keys)  → boolean
 *   hybridSignJSON(obj, keyPair)      → { ...obj, _hybridSig: HybridSignature }
 *   hybridVerifyJSON(obj, keys)       → boolean
 *
 * @see docs/pq-migration.md
 */

import { createHash } from 'node:crypto';
import { generateClassicalKeyPair, classicalSign, classicalVerify } from './src/classical.js';
import { generatePQKeyPair, pqSign, pqVerify, IS_STUB, ALGORITHM as PQ_ALGORITHM } from './src/pq-stub.js';

export { IS_STUB as PQ_IS_STUB, PQ_ALGORITHM };
export { generateClassicalKeyPair, classicalSign, classicalVerify };
export { generatePQKeyPair, pqSign, pqVerify };

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {object} HybridKeyPair
 * @property {{ privateKey: string, publicKey: string }} classical - Ed25519 PEM keys
 * @property {{ secretKey: Uint8Array, publicKey: Uint8Array }} pq - PQ key pair
 */

/**
 * @typedef {object} HybridSignature
 * @property {string}  classicalSig - base64url Ed25519 signature
 * @property {string}  pqSig        - base64url PQ signature
 * @property {string}  algorithm    - e.g. "Ed25519+ML-DSA-87" or "Ed25519+HMAC-SHA3-512-STUB"
 * @property {string}  messageDigest - SHA-256 of signed message (hex)
 * @property {boolean} pqIsStub     - true if PQ layer is a stub
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Normalizes a message to a Buffer for consistent signing.
 * Objects are canonically JSON-serialized (sorted keys).
 * @param {string|Buffer|object} message
 * @returns {Buffer}
 */
function normalizeMessage(message) {
  if (Buffer.isBuffer(message)) return message;
  if (typeof message === 'string') return Buffer.from(message, 'utf8');
  if (typeof message === 'object') {
    return Buffer.from(JSON.stringify(message, Object.keys(message).sort()), 'utf8');
  }
  throw new TypeError('pq-crypto: message must be string, Buffer, or object');
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Generate a fresh hybrid key pair (classical + PQ).
 * @returns {HybridKeyPair}
 */
export function generateHybridKeyPair() {
  return {
    classical: generateClassicalKeyPair(),
    pq: generatePQKeyPair(),
  };
}

/**
 * Produce a hybrid signature over a message.
 *
 * @param {string|Buffer|object} message
 * @param {HybridKeyPair} keyPair
 * @returns {HybridSignature}
 */
export function hybridSign(message, keyPair) {
  const msg = normalizeMessage(message);
  const classicalSig = classicalSign(msg, keyPair.classical.privateKey);
  const pqSigBytes = pqSign(msg, keyPair.pq.secretKey);
  const messageDigest = createHash('sha256').update(msg).digest('hex');

  return {
    classicalSig,
    pqSig: Buffer.from(pqSigBytes).toString('base64url'),
    algorithm: `Ed25519+${PQ_ALGORITHM}`,
    messageDigest,
    pqIsStub: IS_STUB,
  };
}

/**
 * Verify a hybrid signature.
 * Both the classical AND the PQ signature must verify.
 *
 * @param {string|Buffer|object} message
 * @param {HybridSignature} sig
 * @param {{ classical: { publicKey: string }, pq: { publicKey: Uint8Array, secretKey?: Uint8Array } }} keys
 * @returns {boolean}
 */
export function hybridVerify(message, sig, keys) {
  const msg = normalizeMessage(message);

  // 1. Message digest check
  const actualDigest = createHash('sha256').update(msg).digest('hex');
  if (actualDigest !== sig.messageDigest) return false;

  // 2. Classical Ed25519 verify
  const classicalOk = classicalVerify(msg, sig.classicalSig, keys.classical.publicKey);
  if (!classicalOk) return false;

  // 3. PQ verify (stub requires secretKey; real impl uses publicKey only)
  const pqSigBytes = Buffer.from(sig.pqSig, 'base64url');
  const pqOk = pqVerify(msg, pqSigBytes, keys.pq.publicKey, keys.pq.secretKey);

  return pqOk;
}

/**
 * Signs a JSON-serializable object, appending `_hybridSig` to the output.
 * The signature covers the object WITHOUT the `_hybridSig` field.
 *
 * @param {object} obj
 * @param {HybridKeyPair} keyPair
 * @returns {object} Object with `_hybridSig` appended
 */
export function hybridSignJSON(obj, keyPair) {
  const { _hybridSig: _, ...payload } = obj; // strip any existing sig
  const sig = hybridSign(payload, keyPair);
  return { ...payload, _hybridSig: sig };
}

/**
 * Verify a `_hybridSig`-annotated object.
 *
 * @param {object} obj - Object with `_hybridSig` field
 * @param {{ classical: { publicKey: string }, pq: { publicKey: Uint8Array, secretKey?: Uint8Array } }} keys
 * @returns {boolean}
 */
export function hybridVerifyJSON(obj, keys) {
  const { _hybridSig: sig, ...payload } = obj;
  if (!sig) return false;
  return hybridVerify(payload, sig, keys);
}

/**
 * Returns a human-readable security summary for the current hybrid configuration.
 * @returns {object}
 */
export function securitySummary() {
  return {
    classicalAlgorithm: 'Ed25519',
    classicalSecurityBits: 128,
    pqAlgorithm: PQ_ALGORITHM,
    pqIsStub: IS_STUB,
    pqTargetAlgorithm: 'ML-DSA-87 (NIST FIPS 204)',
    pqTargetSecurityBits: 256,
    hybridAlgorithm: `Ed25519+${PQ_ALGORITHM}`,
    productionReady: !IS_STUB,
    migrationDoc: 'docs/pq-migration.md',
  };
}

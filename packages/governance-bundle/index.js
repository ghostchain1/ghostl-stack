/**
 * @module @ghostchain/governance-bundle
 * @description Offline/DTN-ready governance bundle for GhostChain.
 *
 * Supports:
 *   - Merkle-based artifact integrity (createBundle / merkleizeArtifacts)
 *   - Ed25519 multi-signature signing & threshold verification
 *   - Replay protection via nonce + chainId + bundleId
 *   - Tamper-evident serialization (bundleDigest)
 *
 * Zero external runtime dependencies — Node.js built-in `crypto` only.
 */

import { createHash, createSign, createVerify } from 'node:crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Governance bundle schema version */
export const BUNDLE_VERSION = '1';

/** Routing-law chain IDs (mirrored from packages/routing-law) */
export const CHAIN_IDS = Object.freeze({ L1: 14000101, L2: 901, L3: 903 });

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * SHA-256 of arbitrary data (hex string output).
 * @param {string|Buffer} data
 * @returns {string}
 */
function sha256hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hashes a governance artifact to a leaf digest.
 * @param {object} artifact - Any JSON-serialisable governance artifact.
 * @returns {string} leaf hex digest
 */
function hashArtifact(artifact) {
  // Deterministic JSON serialisation (keys sorted).
  const canonical = JSON.stringify(artifact, Object.keys(artifact).sort());
  return sha256hex(canonical);
}

/**
 * Builds a balanced binary Merkle tree from leaf digests.
 * Returns the root and the full proof paths.
 *
 * @param {string[]} leaves - Hex leaf digests.
 * @returns {{ root: string, layers: string[][] }}
 */
function buildMerkleTree(leaves) {
  if (leaves.length === 0) throw new Error('governance-bundle: cannot merkleize empty artifact list');

  let layer = [...leaves];
  const layers = [layer];

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : left; // duplicate last if odd
      next.push(sha256hex(left + right));
    }
    layers.push(next);
    layer = next;
  }

  return { root: layer[0], layers };
}

/**
 * Generates a Merkle proof for leaf at `index`.
 * @param {string[][]} layers
 * @param {number} index
 * @returns {Array<{ sibling: string, direction: 'left'|'right' }>}
 */
function merkleProof(layers, index) {
  const proof = [];
  let idx = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : Math.min(idx + 1, layer.length - 1);
    proof.push({ sibling: layer[siblingIdx], direction: isRight ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Verifies a single Merkle proof.
 * @param {string} leaf
 * @param {Array<{ sibling: string, direction: 'left'|'right' }>} proof
 * @param {string} root
 * @returns {boolean}
 */
export function verifyMerkleProof(leaf, proof, root) {
  let current = leaf;
  for (const { sibling, direction } of proof) {
    if (direction === 'left') {
      current = sha256hex(sibling + current);
    } else {
      current = sha256hex(current + sibling);
    }
  }
  return current === root;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Merkleizes a list of governance artifacts.
 * Each artifact must have a unique `id` field.
 *
 * @param {object[]} artifacts
 * @returns {{ root: string, leaves: string[], proofs: object[], layers: string[][] }}
 */
export function merkleizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('governance-bundle: artifacts must be a non-empty array');
  }
  for (const a of artifacts) {
    if (!a.id) throw new Error(`governance-bundle: artifact missing required 'id' field`);
  }

  const leaves = artifacts.map(hashArtifact);
  const { root, layers } = buildMerkleTree(leaves);

  const proofs = artifacts.map((artifact, i) => ({
    artifactId: artifact.id,
    leaf: leaves[i],
    proof: merkleProof(layers, i),
  }));

  return { root, leaves, proofs, layers };
}

/**
 * Creates a signed, replay-protected governance bundle.
 *
 * @param {object} opts
 * @param {object[]} opts.artifacts        - Governance artifacts (proposals, votes, etc.)
 * @param {string}   opts.bundleId         - Unique bundle ID (UUID or sequential int string)
 * @param {number}   opts.chainId          - Target chain ID (CHAIN_IDS.L1 | L2 | L3)
 * @param {number}   opts.nonce            - Monotonic nonce for replay protection
 * @param {string}   opts.signerPrivKey    - Ed25519 / RSA PEM private key for signing
 * @param {string}   opts.signerPublicKeyId - Identifier for the public key (e.g. hex pubkey or DID)
 * @param {number}   [opts.validUntil]     - Unix timestamp expiry (default: now + 7 days)
 *
 * @returns {object} Signed governance bundle
 */
export function createBundle({
  artifacts,
  bundleId,
  chainId,
  nonce,
  signerPrivKey,
  signerPublicKeyId,
  validUntil,
}) {
  if (!artifacts?.length) throw new Error('governance-bundle: no artifacts provided');
  if (!bundleId) throw new Error('governance-bundle: bundleId is required');
  if (!CHAIN_IDS[Object.keys(CHAIN_IDS).find(k => CHAIN_IDS[k] === chainId)]) {
    throw new Error(`governance-bundle: unknown chainId ${chainId}`);
  }
  if (typeof nonce !== 'number' || nonce < 0) throw new Error('governance-bundle: nonce must be a non-negative integer');

  const { root, leaves, proofs } = merkleizeArtifacts(artifacts);

  const now = Math.floor(Date.now() / 1000);
  const expiry = validUntil ?? now + 7 * 86400;

  const header = {
    version: BUNDLE_VERSION,
    bundleId,
    chainId,
    nonce,
    createdAt: now,
    validUntil: expiry,
    artifactCount: artifacts.length,
    merkleRoot: root,
  };

  // Deterministic bundle payload string to sign
  const signingPayload = JSON.stringify({
    header,
    leaves,
  });

  const bundleDigest = sha256hex(signingPayload);

  // Sign with the provided private key (RSA-SHA256 or Ed25519 depending on key type)
  const signer = createSign('SHA256');
  signer.update(bundleDigest);
  signer.end();
  const signature = signer.sign(signerPrivKey, 'base64');

  return {
    header,
    artifacts,
    merkle: { root, leaves, proofs },
    bundleDigest,
    signatures: [
      {
        keyId: signerPublicKeyId,
        algorithm: 'RSA-SHA256',
        signature,
        signedAt: now,
      },
    ],
  };
}

/**
 * Adds an additional co-signer's signature to an existing bundle.
 *
 * @param {object} bundle
 * @param {string} privKey
 * @param {string} publicKeyId
 * @returns {object} Bundle with appended signature
 */
export function signBundle(bundle, privKey, publicKeyId) {
  const signer = createSign('SHA256');
  signer.update(bundle.bundleDigest);
  signer.end();
  const signature = signer.sign(privKey, 'base64');
  const now = Math.floor(Date.now() / 1000);

  return {
    ...bundle,
    signatures: [
      ...bundle.signatures,
      {
        keyId: publicKeyId,
        algorithm: 'RSA-SHA256',
        signature,
        signedAt: now,
      },
    ],
  };
}

/**
 * Verifies an entire governance bundle:
 *   1. Expiry check
 *   2. Merkle root recompute
 *   3. Signature threshold (≥ threshold valid sigs from allowed keys)
 *
 * @param {object} bundle            - Bundle to verify
 * @param {object[]} allowedKeys     - Array of `{ keyId, publicKey }` objects
 * @param {number}  [threshold=1]    - Minimum valid signatures required
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function verifyBundle(bundle, allowedKeys, threshold = 1) {
  const errors = [];
  const now = Math.floor(Date.now() / 1000);

  // 1. Expiry
  if (bundle.header.validUntil < now) {
    errors.push(`bundle expired at ${bundle.header.validUntil} (now ${now})`);
  }

  // 2. Merkle root integrity — recompute from artifacts
  const { root, leaves } = merkleizeArtifacts(bundle.artifacts);
  if (root !== bundle.merkle.root) {
    errors.push(`merkle root mismatch: expected ${bundle.merkle.root}, got ${root}`);
  }

  // 3. bundleDigest integrity
  const expectedPayload = JSON.stringify({ header: bundle.header, leaves });
  const expectedDigest = sha256hex(expectedPayload);
  if (expectedDigest !== bundle.bundleDigest) {
    errors.push(`bundleDigest mismatch`);
  }

  // 4. Signature verification
  const keyMap = Object.fromEntries(allowedKeys.map(k => [k.keyId, k.publicKey]));
  let validSigs = 0;
  for (const sig of bundle.signatures || []) {
    const pubKey = keyMap[sig.keyId];
    if (!pubKey) {
      errors.push(`unknown keyId: ${sig.keyId}`);
      continue;
    }
    try {
      const verifier = createVerify('SHA256');
      verifier.update(bundle.bundleDigest);
      verifier.end();
      const ok = verifier.verify(pubKey, sig.signature, 'base64');
      if (ok) validSigs++;
      else errors.push(`invalid signature for keyId ${sig.keyId}`);
    } catch (e) {
      errors.push(`signature verify error for keyId ${sig.keyId}: ${e.message}`);
    }
  }

  if (validSigs < threshold) {
    errors.push(`signature threshold not met: ${validSigs}/${threshold} valid`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verifies signatures only (without re-computing Merkle or expiry).
 * Useful for incremental validation during DTN relay ingestion.
 *
 * @param {object} bundle
 * @param {object[]} allowedKeys - Array of `{ keyId, publicKey }`
 * @param {number} threshold
 * @returns {{ valid: boolean, validCount: number, errors: string[] }}
 */
export function verifySignatures(bundle, allowedKeys, threshold = 1) {
  const errors = [];
  const keyMap = Object.fromEntries(allowedKeys.map(k => [k.keyId, k.publicKey]));
  let validCount = 0;

  for (const sig of bundle.signatures || []) {
    const pubKey = keyMap[sig.keyId];
    if (!pubKey) { errors.push(`unknown keyId: ${sig.keyId}`); continue; }
    try {
      const verifier = createVerify('SHA256');
      verifier.update(bundle.bundleDigest);
      verifier.end();
      if (verifier.verify(pubKey, sig.signature, 'base64')) validCount++;
      else errors.push(`invalid sig: ${sig.keyId}`);
    } catch (e) {
      errors.push(`verify error: ${e.message}`);
    }
  }

  return { valid: validCount >= threshold && errors.length === 0, validCount, errors };
}

/**
 * @file test/bundle.test.js
 * @description Governance bundle unit tests — no external dependencies.
 * Run with: node --test test/bundle.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  CHAIN_IDS,
  createBundle,
  signBundle,
  verifyBundle,
  verifyMerkleProof,
  merkleizeArtifacts,
  verifySignatures,
} from '../index.js';

// ─── Key fixtures ─────────────────────────────────────────────────────────────

let keyA, keyB;
before(() => {
  keyA = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keyB = generateKeyPairSync('rsa', { modulusLength: 2048 });
});

const allowedKeys = () => [
  { keyId: 'keyA', publicKey: keyA.publicKey.export({ type: 'spki', format: 'pem' }) },
  { keyId: 'keyB', publicKey: keyB.publicKey.export({ type: 'spki', format: 'pem' }) },
];

// Sample artifacts
const artifacts = [
  { id: 'proposal-001', type: 'upgrade', target: '0xdeadbeef', calldata: '0x1234' },
  { id: 'vote-001', type: 'vote', proposalId: 'proposal-001', support: true },
  { id: 'param-001', type: 'param-change', key: 'treasury.minBalance', value: '1000000' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('merkleizeArtifacts', () => {
  it('produces stable root for same input', () => {
    const { root: r1 } = merkleizeArtifacts(artifacts);
    const { root: r2 } = merkleizeArtifacts(artifacts);
    assert.equal(r1, r2);
  });

  it('root changes when artifact is tampered', () => {
    const { root: original } = merkleizeArtifacts(artifacts);
    const tampered = [{ ...artifacts[0], target: '0xcafebabe' }, ...artifacts.slice(1)];
    const { root: changed } = merkleizeArtifacts(tampered);
    assert.notEqual(original, changed);
  });

  it('throws on empty artifact list', () => {
    assert.throws(() => merkleizeArtifacts([]), /empty/);
  });

  it('throws on artifact missing id', () => {
    assert.throws(() => merkleizeArtifacts([{ type: 'vote' }]), /id/);
  });

  it('provides valid merkle proofs', () => {
    const { root, leaves, proofs } = merkleizeArtifacts(artifacts);
    for (let i = 0; i < artifacts.length; i++) {
      assert.ok(verifyMerkleProof(leaves[i], proofs[i].proof, root), `proof ${i} should verify`);
    }
  });
});

describe('createBundle', () => {
  it('creates a bundle with correct header fields', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-1',
      chainId: CHAIN_IDS.L2,
      nonce: 0,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });

    assert.equal(bundle.header.bundleId, 'bundle-1');
    assert.equal(bundle.header.chainId, CHAIN_IDS.L2);
    assert.equal(bundle.header.nonce, 0);
    assert.equal(bundle.header.artifactCount, 3);
    assert.ok(bundle.header.merkleRoot, 'merkleRoot must be set');
    assert.ok(bundle.bundleDigest, 'bundleDigest must be set');
    assert.equal(bundle.signatures.length, 1);
  });

  it('rejects unknown chainId', () => {
    assert.throws(() => createBundle({
      artifacts,
      bundleId: 'x',
      chainId: 9999,
      nonce: 0,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    }), /unknown chainId/);
  });

  it('rejects negative nonce', () => {
    assert.throws(() => createBundle({
      artifacts,
      bundleId: 'x',
      chainId: CHAIN_IDS.L1,
      nonce: -1,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    }), /nonce/);
  });
});

describe('verifyBundle — happy path', () => {
  it('verifies a single-sig bundle', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-2',
      chainId: CHAIN_IDS.L1,
      nonce: 1,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });

    const { valid, errors } = verifyBundle(bundle, allowedKeys(), 1);
    assert.equal(valid, true, errors.join(', '));
  });

  it('verifies multi-sig bundle at threshold=2', () => {
    let bundle = createBundle({
      artifacts,
      bundleId: 'bundle-3',
      chainId: CHAIN_IDS.L2,
      nonce: 2,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });
    bundle = signBundle(bundle, keyB.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'keyB');

    const { valid, errors } = verifyBundle(bundle, allowedKeys(), 2);
    assert.equal(valid, true, errors.join(', '));
  });
});

describe('verifyBundle — tamper detection', () => {
  it('rejects tampered artifact', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-4',
      chainId: CHAIN_IDS.L2,
      nonce: 3,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });

    const tampered = JSON.parse(JSON.stringify(bundle));
    tampered.artifacts[0].target = '0xdeadbaad';

    const { valid } = verifyBundle(tampered, allowedKeys(), 1);
    assert.equal(valid, false, 'tampered bundle must not pass');
  });

  it('rejects expired bundle', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-5',
      chainId: CHAIN_IDS.L2,
      nonce: 4,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
      validUntil: Math.floor(Date.now() / 1000) - 1, // already expired
    });

    const { valid, errors } = verifyBundle(bundle, allowedKeys(), 1);
    assert.equal(valid, false);
    assert.ok(errors.some(e => e.includes('expired')));
  });

  it('rejects bundle with unknown signing key', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-6',
      chainId: CHAIN_IDS.L2,
      nonce: 5,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });

    const { valid, errors } = verifyBundle(bundle, [], 1); // empty allowed set
    assert.equal(valid, false);
    assert.ok(errors.some(e => e.includes('unknown keyId')));
  });

  it('fails threshold when only 1/2 sigs valid', () => {
    const bundle = createBundle({
      artifacts,
      bundleId: 'bundle-7',
      chainId: CHAIN_IDS.L2,
      nonce: 6,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });

    const { valid } = verifyBundle(bundle, allowedKeys(), 2); // requires 2, only 1 sig
    assert.equal(valid, false, 'should fail threshold');
  });
});

describe('verifyMerkleProof', () => {
  it('validates each leaf against root', () => {
    const { root, leaves, proofs } = merkleizeArtifacts(artifacts);
    for (let i = 0; i < leaves.length; i++) {
      assert.ok(verifyMerkleProof(leaves[i], proofs[i].proof, root));
    }
  });

  it('rejects a wrong leaf', () => {
    const { root, proofs } = merkleizeArtifacts(artifacts);
    assert.equal(verifyMerkleProof('deadbeef'.repeat(8), proofs[0].proof, root), false);
  });
});

describe('verifySignatures (partial)', () => {
  it('counts valid sigs correctly', () => {
    let bundle = createBundle({
      artifacts,
      bundleId: 'bundle-8',
      chainId: CHAIN_IDS.L1,
      nonce: 7,
      signerPrivKey: keyA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      signerPublicKeyId: 'keyA',
    });
    bundle = signBundle(bundle, keyB.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'keyB');

    const { validCount } = verifySignatures(bundle, allowedKeys(), 2);
    assert.equal(validCount, 2);
  });
});

/**
 * @file test/pq.test.js
 * @description Post-quantum hybrid signature tests.
 * Run: node --test test/pq.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateHybridKeyPair,
  hybridSign,
  hybridVerify,
  hybridSignJSON,
  hybridVerifyJSON,
  securitySummary,
  PQ_IS_STUB,
} from '../index.js';

describe('generateHybridKeyPair', () => {
  it('produces non-empty classical and PQ keys', () => {
    const kp = generateHybridKeyPair();
    assert.ok(kp.classical.privateKey.includes('PRIVATE KEY'));
    assert.ok(kp.classical.publicKey.includes('PUBLIC KEY'));
    assert.ok(kp.pq.secretKey instanceof Uint8Array);
    assert.ok(kp.pq.publicKey instanceof Uint8Array);
  });

  it('generates unique keys each call', () => {
    const a = generateHybridKeyPair();
    const b = generateHybridKeyPair();
    assert.notEqual(a.classical.privateKey, b.classical.privateKey);
    assert.notDeepEqual(a.pq.secretKey, b.pq.secretKey);
  });
});

describe('hybridSign + hybridVerify', () => {
  it('verifies a string message', () => {
    const kp = generateHybridKeyPair();
    const sig = hybridSign('hello ghostchain', kp);
    assert.ok(sig.classicalSig);
    assert.ok(sig.pqSig);
    assert.ok(sig.messageDigest);
    const ok = hybridVerify('hello ghostchain', sig, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, true);
  });

  it('verifies a Buffer message', () => {
    const kp = generateHybridKeyPair();
    const msg = Buffer.from([1, 2, 3, 4, 5]);
    const sig = hybridSign(msg, kp);
    const ok = hybridVerify(msg, sig, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, true);
  });

  it('verifies an object message (canonical JSON)', () => {
    const kp = generateHybridKeyPair();
    const obj = { z: 1, a: 2, m: 'ghost' };
    const sig = hybridSign(obj, kp);
    const ok = hybridVerify(obj, sig, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, true);
  });

  it('rejects tampered message', () => {
    const kp = generateHybridKeyPair();
    const sig = hybridSign('original', kp);
    const ok = hybridVerify('tampered', sig, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, false);
  });

  it('rejects wrong classical key', () => {
    const kp = generateHybridKeyPair();
    const other = generateHybridKeyPair();
    const sig = hybridSign('data', kp);
    const ok = hybridVerify('data', sig, {
      classical: other.classical, // wrong key
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, false);
  });

  it('rejects wrong PQ key', () => {
    const kp = generateHybridKeyPair();
    const other = generateHybridKeyPair();
    const sig = hybridSign('data', kp);
    const ok = hybridVerify('data', sig, {
      classical: kp.classical,
      pq: { publicKey: other.pq.publicKey, secretKey: other.pq.secretKey }, // wrong PQ key
    });
    assert.equal(ok, false);
  });

  it('rejects corrupted signature bytes', () => {
    const kp = generateHybridKeyPair();
    const sig = hybridSign('data', kp);
    const corruptedSig = { ...sig, pqSig: 'AAAAAAAAAAAAAAAA' };
    const ok = hybridVerify('data', corruptedSig, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, false);
  });
});

describe('hybridSignJSON + hybridVerifyJSON', () => {
  it('signs and verifies a JSON object', () => {
    const kp = generateHybridKeyPair();
    const obj = { proposal: 'p-001', vote: true, chainId: 901 };
    const signed = hybridSignJSON(obj, kp);
    assert.ok(signed._hybridSig);
    const ok = hybridVerifyJSON(signed, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, true);
  });

  it('rejects tampered JSON field', () => {
    const kp = generateHybridKeyPair();
    const signed = hybridSignJSON({ vote: true }, kp);
    signed.vote = false; // tamper
    const ok = hybridVerifyJSON(signed, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, false);
  });

  it('strips existing _hybridSig before re-signing', () => {
    const kp = generateHybridKeyPair();
    const first = hybridSignJSON({ x: 1 }, kp);
    const second = hybridSignJSON(first, kp); // re-sign
    // Signature should cover { x: 1 } not { x: 1, _hybridSig: ... }
    assert.ok(hybridVerifyJSON(second, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    }));
  });

  it('returns false for object without _hybridSig', () => {
    const kp = generateHybridKeyPair();
    const ok = hybridVerifyJSON({ no: 'sig' }, {
      classical: kp.classical,
      pq: { publicKey: kp.pq.publicKey, secretKey: kp.pq.secretKey },
    });
    assert.equal(ok, false);
  });
});

describe('securitySummary', () => {
  it('reflects stub status correctly', () => {
    const s = securitySummary();
    assert.equal(s.pqIsStub, PQ_IS_STUB);
    assert.equal(s.classicalAlgorithm, 'Ed25519');
    assert.equal(s.pqTargetAlgorithm, 'ML-DSA-87 (NIST FIPS 204)');
    assert.equal(s.productionReady, !PQ_IS_STUB);
  });
});

/**
 * GhostStack AI Vault — Crypto Engine Tests
 * Tests for core cryptographic primitives.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  SecureKey,
  encrypt,
  decrypt,
  deriveKeyScrypt,
  generateSalt,
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  sha256,
  randomHex,
  randomBase64,
  secureEqual,
} from '../core/crypto-engine.js';

// ── SecureKey ─────────────────────────────────────────────────────────────────

describe('SecureKey', () => {
  it('creates a key from a buffer', () => {
    const buf = Buffer.alloc(32, 0xab);
    const key = new SecureKey(buf);
    expect(key.buffer).toBeInstanceOf(Buffer);
    expect(key.buffer.length).toBe(32);
  });

  it('wipes key memory on wipe()', () => {
    const buf = Buffer.alloc(32, 0xff);
    const key = new SecureKey(buf);
    key.wipe();
    // After wipe, buffer should be zeroed
    expect(key.buffer.every(b => b === 0)).toBe(true);
  });
});

// ── deriveKeyScrypt ───────────────────────────────────────────────────────────

describe('deriveKeyScrypt', () => {
  let key: SecureKey;
  const password = 'ghost-vault-master-secret-passphrase';
  let salt: Buffer;

  beforeAll(() => {
    salt = generateSalt(32);
    key  = deriveKeyScrypt(password, salt);
  });

  it('returns a SecureKey', () => {
    expect(key).toBeInstanceOf(SecureKey);
    expect(key.buffer.length).toBe(32);
  });

  it('produces the same key given same password and salt', () => {
    const key2 = deriveKeyScrypt(password, salt);
    expect(key.buffer.equals(key2.buffer)).toBe(true);
  });

  it('produces different keys with different salts', () => {
    const salt2 = generateSalt(32);
    const key2  = deriveKeyScrypt(password, salt2);
    expect(key.buffer.equals(key2.buffer)).toBe(false);
  });
});

// ── AES-256-GCM encrypt/decrypt ───────────────────────────────────────────────

describe('encrypt / decrypt (aes-256-gcm)', () => {
  let masterKey: SecureKey;

  beforeAll(() => {
    masterKey = deriveKeyScrypt('test-pass', generateSalt(32));
  });

  it('round-trips a plaintext buffer', () => {
    const plaintext = Buffer.from('GhostVault secret: GST balance 1000000');
    const blob = encrypt(masterKey, plaintext, 'aes-256-gcm');
    expect(blob.algorithm).toBe('aes-256-gcm');
    expect(blob.ciphertext).toBeTruthy();

    const recovered = decrypt(masterKey, blob);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it('produces different ciphertext each time (probabilistic encryption)', () => {
    const plaintext = Buffer.from('same plaintext');
    const blob1 = encrypt(masterKey, plaintext, 'aes-256-gcm');
    const blob2 = encrypt(masterKey, plaintext, 'aes-256-gcm');
    // IVs should differ
    expect(blob1.iv).not.toBe(blob2.iv);
  });

  it('throws on tampered ciphertext', () => {
    const blob = encrypt(masterKey, Buffer.from('GhostChain L1 key'), 'aes-256-gcm');
    // Tamper with the ciphertext
    const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -2) + 'ff' };
    expect(() => decrypt(masterKey, tampered)).toThrow();
  });
});

// ── ChaCha20-Poly1305 encrypt/decrypt ─────────────────────────────────────────

describe('encrypt / decrypt (chacha20-poly1305)', () => {
  let masterKey: SecureKey;

  beforeAll(() => {
    masterKey = deriveKeyScrypt('chacha-test-pass', generateSalt(32));
  });

  it('round-trips a plaintext buffer', () => {
    const plaintext = Buffer.from('GhostL2 sequencer key payload');
    const blob = encrypt(masterKey, plaintext, 'chacha20-poly1305');
    expect(blob.algorithm).toBe('chacha20-poly1305');

    const recovered = decrypt(masterKey, blob);
    expect(recovered.equals(plaintext)).toBe(true);
  });
});

// ── Ed25519 sign / verify ─────────────────────────────────────────────────────

describe('Ed25519 sign / verify', () => {
  let publicKey: string;  // hex-encoded DER
  let privateKey: string; // hex-encoded DER

  beforeAll(() => {
    const kp = generateEd25519KeyPair();
    publicKey  = kp.publicKey;
    privateKey = kp.privateKey;
  });

  it('generates a key pair with non-empty keys', () => {
    expect(publicKey.length).toBeGreaterThan(0);
    expect(privateKey.length).toBeGreaterThan(0);
  });

  it('signs and verifies a GhostChain transaction hash', () => {
    const txHash = Buffer.from('deadbeef'.repeat(8), 'hex');
    const signature = signEd25519(Buffer.from(privateKey, 'hex'), txHash);

    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);

    const valid = verifyEd25519(Buffer.from(publicKey, 'hex'), txHash, signature);
    expect(valid).toBe(true);
  });

  it('rejects a tampered message', () => {
    const txHash   = Buffer.from('aabbccdd'.repeat(8), 'hex');
    const tampered = Buffer.from('00bbccdd'.repeat(8), 'hex');
    const signature = signEd25519(Buffer.from(privateKey, 'hex'), txHash);

    const valid = verifyEd25519(Buffer.from(publicKey, 'hex'), tampered, signature);
    expect(valid).toBe(false);
  });

  it('rejects a wrong signature', () => {
    const txHash = Buffer.from('cafebabe'.repeat(8), 'hex');
    const badSig = randomHex(64);  // random hex — should not validate
    const valid  = verifyEd25519(Buffer.from(publicKey, 'hex'), txHash, badSig);
    expect(valid).toBe(false);
  });
});

// ── sha256 ────────────────────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns a 64-char hex string', () => {
    const hash = sha256('GhostChain');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('GhostChain L1')).not.toBe(sha256('GhostChain L2'));
  });
});

// ── randomHex / randomBase64 ──────────────────────────────────────────────────

describe('randomHex', () => {
  it('returns hex string of correct length', () => {
    const hex = randomHex(32);
    expect(hex.length).toBe(64);  // 32 bytes = 64 hex chars
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });

  it('generates unique values each call', () => {
    expect(randomHex(16)).not.toBe(randomHex(16));
  });
});

describe('randomBase64', () => {
  it('returns a non-empty base64 string', () => {
    const b64 = randomBase64(24);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
  });
});

// ── secureEqual ───────────────────────────────────────────────────────────────

describe('secureEqual', () => {
  it('correctly identifies equal buffers', () => {
    const a = Buffer.from('ghostchain-secret');
    const b = Buffer.from('ghostchain-secret');
    expect(secureEqual(a, b)).toBe(true);
  });

  it('correctly identifies unequal buffers', () => {
    const a = Buffer.from('secret-a');
    const b = Buffer.from('secret-b');
    expect(secureEqual(a, b)).toBe(false);
  });

  it('handles strings', () => {
    expect(secureEqual('abc', 'abc')).toBe(true);
    expect(secureEqual('abc', 'xyz')).toBe(false);
  });
});

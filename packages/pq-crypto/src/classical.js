/**
 * @file src/classical.js
 * @description Classical (pre-quantum) Ed25519 signing layer for the hybrid scheme.
 *
 * Uses Node.js built-in `crypto` — zero external dependencies.
 */

import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey } from 'node:crypto';

/** @typedef {{ privateKey: string, publicKey: string }} Ed25519KeyPair */

/**
 * Generate an Ed25519 key pair in PEM format.
 * @returns {Ed25519KeyPair}
 */
export function generateClassicalKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

/**
 * Sign data with Ed25519 private key.
 * Ed25519 uses one-shot signing (no streaming, no separate hash step).
 * @param {string|Buffer} data
 * @param {string} privateKeyPem
 * @returns {string} base64url signature
 */
export function classicalSign(data, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return cryptoSign(null, buf, key).toString('base64url');
}

/**
 * Verify an Ed25519 signature.
 * @param {string|Buffer} data
 * @param {string} signatureB64u - base64url signature
 * @param {string} publicKeyPem
 * @returns {boolean}
 */
export function classicalVerify(data, signatureB64u, publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return cryptoVerify(null, buf, key, Buffer.from(signatureB64u, 'base64url'));
  } catch {
    return false;
  }
}

/**
 * @module @ghostchain/ghostchain-cryptography/secp256k1
 *
 * secp256k1 elliptic curve. Drop-in replacement for ethereum-cryptography/secp256k1.
 * Backed by @noble/curves.
 *
 * The `secp256k1` named export is the full curve object.
 * See https://github.com/paulmillr/noble-curves for full API.
 */
export { secp256k1 } from "@noble/curves/secp256k1";

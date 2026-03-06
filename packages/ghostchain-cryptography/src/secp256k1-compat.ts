/**
 * @module @ghostchain/ghostchain-cryptography/secp256k1-compat
 *
 * Compatibility layer for the legacy `secp256k1` native Node.js module API.
 * Drop-in replacement for ethereum-cryptography/secp256k1-compat.
 * Backed by @noble/curves.
 *
 * This module provides the same synchronous function signatures as the
 * `secp256k1` native bindings formerly used by ethereumjs.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils";

const { ProjectivePoint, Signature, utils } = secp256k1;

// ─── Private key ──────────────────────────────────────────────────────────────

export function createPrivateKeySync(): Uint8Array {
  return utils.randomPrivateKey();
}

export async function createPrivateKey(): Promise<Uint8Array> {
  return utils.randomPrivateKey();
}

export function privateKeyVerify(privateKey: Uint8Array): boolean {
  try {
    utils.isValidPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

// ─── Public key ───────────────────────────────────────────────────────────────

export function publicKeyCreate(privateKey: Uint8Array, compressed = true): Uint8Array {
  return secp256k1.getPublicKey(privateKey, compressed);
}

export function publicKeyVerify(publicKey: Uint8Array): boolean {
  try {
    ProjectivePoint.fromHex(publicKey);
    return true;
  } catch {
    return false;
  }
}

export function publicKeyConvert(publicKey: Uint8Array, compressed = true): Uint8Array {
  return ProjectivePoint.fromHex(publicKey).toRawBytes(compressed);
}

// ─── ECDSA ────────────────────────────────────────────────────────────────────

export interface SignatureObj {
  signature: Uint8Array;
  recovery: number;
}

export function ecdsaSign(msgHash: Uint8Array, privateKey: Uint8Array): SignatureObj {
  const sig = secp256k1.sign(msgHash, privateKey, { lowS: true });
  return {
    signature: sig.toCompactRawBytes(),
    recovery: sig.recovery ?? 0,
  };
}

export function ecdsaRecover(
  signature: Uint8Array,
  recovery: number,
  msgHash: Uint8Array,
  compressed = true,
): Uint8Array {
  const sig = Signature.fromCompact(signature).addRecoveryBit(recovery);
  const point = sig.recoverPublicKey(msgHash);
  return point.toRawBytes(compressed);
}

export function ecdsaVerify(
  signature: Uint8Array,
  msgHash: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    const sig = Signature.fromCompact(signature);
    return secp256k1.verify(sig, msgHash, publicKey, { lowS: true });
  } catch {
    return false;
  }
}

// ─── DER signature encoding ───────────────────────────────────────────────────

export function signatureExport(signature: Uint8Array): Uint8Array {
  return Signature.fromCompact(signature).toDERRawBytes();
}

export function signatureImport(derSignature: Uint8Array): Uint8Array {
  return Signature.fromDER(derSignature).toCompactRawBytes();
}

export function signatureNormalize(signature: Uint8Array): Uint8Array {
  return Signature.fromCompact(signature).normalizeS().toCompactRawBytes();
}

// ─── Key tweaking ─────────────────────────────────────────────────────────────

const N = secp256k1.CURVE.n;

export function privateKeyTweakAdd(privateKey: Uint8Array, tweak: Uint8Array): Uint8Array {
  const privScalar = BigInt("0x" + bytesToHex(privateKey));
  const tweakScalar = BigInt("0x" + bytesToHex(tweak));
  const result = ((privScalar + tweakScalar) % N + N) % N;
  return hexToBytes(result.toString(16).padStart(64, "0"));
}

export function privateKeyNegate(privateKey: Uint8Array): Uint8Array {
  const privScalar = BigInt("0x" + bytesToHex(privateKey));
  const result = (N - privScalar) % N;
  return hexToBytes(result.toString(16).padStart(64, "0"));
}

export function publicKeyNegate(publicKey: Uint8Array, compressed = true): Uint8Array {
  return ProjectivePoint.fromHex(publicKey).negate().toRawBytes(compressed);
}

export function publicKeyCombine(publicKeys: Uint8Array[], compressed = true): Uint8Array {
  const points = publicKeys.map((k) => ProjectivePoint.fromHex(k));
  const combined = points.reduce((acc, p) => acc.add(p));
  return combined.toRawBytes(compressed);
}

export function publicKeyTweakAdd(publicKey: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array {
  const tweakScalar = BigInt("0x" + bytesToHex(tweak));
  const G = ProjectivePoint.BASE;
  const point = ProjectivePoint.fromHex(publicKey).add(G.multiply(tweakScalar));
  return point.toRawBytes(compressed);
}

export function publicKeyTweakMul(publicKey: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array {
  const tweakScalar = BigInt("0x" + bytesToHex(tweak));
  const point = ProjectivePoint.fromHex(publicKey).multiply(tweakScalar);
  return point.toRawBytes(compressed);
}

export function privateKeyTweakMul(privateKey: Uint8Array, tweak: Uint8Array): Uint8Array {
  const privScalar = BigInt("0x" + bytesToHex(privateKey));
  const tweakScalar = BigInt("0x" + bytesToHex(tweak));
  const result = (privScalar * tweakScalar) % N;
  return hexToBytes(result.toString(16).padStart(64, "0"));
}

// ─── ECDH & misc ─────────────────────────────────────────────────────────────

export function ecdh(publicKey: Uint8Array, privateKey: Uint8Array, hashfn?: (x: Uint8Array, y: Uint8Array) => Uint8Array): Uint8Array {
  if (hashfn) {
    const shared = secp256k1.getSharedSecret(privateKey, publicKey);
    const x = shared.slice(1, 33);
    const y = shared.slice(33, 65);
    return hashfn(x, y);
  }
  // Default: return compressed shared secret (33 bytes, 0x02/0x03 prefix)
  return secp256k1.getSharedSecret(privateKey, publicKey, true);
}

/** No-op: random context is not needed for pure-JS implementations. */
export function contextRandomize(_seed: Uint8Array): void {
  // pure-JS secp256k1 has no mutable context state
}

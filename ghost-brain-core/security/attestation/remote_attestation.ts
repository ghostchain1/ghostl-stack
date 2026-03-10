/**
 * GhostBrain — Remote Attestation Client (TypeScript)
 *
 * Implements the GhostBrain remote attestation protocol:
 *   1. Verifier sends a random challenge nonce to the chip's management API
 *   2. Chip signs (challenge + firmware_hash + timestamp) with its eFuse key
 *   3. Client verifies the Ed25519 signature using the chip's registered
 *      public key on GhostChain L1 (fetched from ReadRegistry contract)
 *   4. Client checks that `firmware_hash` matches the L1 manifest
 *   5. Returns an `AttestationResult` indicating TRUSTED / UNTRUSTED
 *
 * GhostBrain holds NO private keys — the signing is performed inside the
 * chip's secure management processor (see security/attestation/chip_identity.rs).
 *
 * This module runs on the HOST (Node.js / GhostBrain Core service) and
 * communicates with the chip via the UCIe sideband management API (HTTP).
 */

import { webcrypto } from "node:crypto";
import type { Hex } from "../../runtime/scheduler/types.js";

// ── Constants ──────────────────────────────────────────────────────────────

/** GhostChain L1 RPC (chain_id=14000101) */
const L1_RPC = process.env["GHOSTCHAIN_L1_RPC"] ?? "http://localhost:18545";

/** GhostBrain firmware registry on L1 */
const FIRMWARE_REGISTRY = "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422";

/** Challenge nonce TTL (seconds) */
const CHALLENGE_TTL_S = 60;

/** GhostBrain management API port (sideband) */
const MGMT_PORT = process.env["GHOSTBRAIN_MGMT_PORT"] ?? "7901";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AttestationChallenge {
  nonce:      Hex;        // 32-byte random challenge
  issuedAt:   number;     // Unix timestamp (seconds)
  chipUuid:   string;     // target chip UUID
}

export interface AttestationResponse {
  chipUuid:     string;
  chipPubkey:   Hex;      // Ed25519 public key (32 bytes, hex)
  firmwareHash: Hex;      // BLAKE3 of running firmware
  timestamp:    number;   // Unix seconds at time of signing
  signature:    Hex;      // Ed25519 sig over (nonce + firmwareHash + timestamp)
  manifestBlock: bigint;  // L1 block number of ratified manifest
}

export type AttestationStatus = "TRUSTED" | "UNTRUSTED" | "ERROR";

export interface AttestationResult {
  status:       AttestationStatus;
  chipUuid:     string;
  firmwareHash: Hex;
  manifestBlock: bigint;
  reason?:      string;
}

// ── Challenge Generation ───────────────────────────────────────────────────

export function generateChallenge(chipUuid: string): AttestationChallenge {
  const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("hex") as Hex;
  return { nonce, issuedAt: Math.floor(Date.now() / 1000), chipUuid };
}

// ── Chip Management API ────────────────────────────────────────────────────

async function requestAttestation(
  challenge: AttestationChallenge,
  chipHost:  string,
): Promise<AttestationResponse> {
  const url = `http://${chipHost}:${MGMT_PORT}/attest`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({
      nonce:    challenge.nonce,
      chipUuid: challenge.chipUuid,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Chip management API error: ${res.status}`);
  }
  const data = await res.json() as AttestationResponse;
  // Deserialize bigint manually (JSON loses BigInt precision)
  data.manifestBlock = BigInt(data.manifestBlock as unknown as string);
  return data;
}

// ── L1 Manifest Fetch ──────────────────────────────────────────────────────

async function fetchOnChainManifest(chipUuid: string): Promise<{
  firmwareHash: Hex;
  govPubkey:    Hex;
  block:        bigint;
} | null> {
  // Call ReadRegistry.getManifest(chipUuid) via ghost_call JSON-RPC.
  // Selector: keccak256("getManifest(string)")[:4]
  const selector = "0xa8bfd7c1";
  const param    = chipUuid.replace(/-/g, "").padStart(64, "0");

  const response = await fetch(L1_RPC, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method:  "ghost_call",
      params:  [{
        to:   FIRMWARE_REGISTRY,
        data: selector + param,
      }, "latest"],
      id: 1,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const rpc = await response.json() as { result?: string; error?: { message: string } };
  if (rpc.error || !rpc.result || rpc.result === "0x") return null;

  // Decode ABI: (bytes32 firmwareHash, address govPubkeyAddr, uint64 block)
  const raw  = rpc.result.replace(/^0x/, "");
  const firmwareHash = `0x${raw.slice(0, 64)}` as Hex;
  const govPubkey    = `0x${raw.slice(64, 128)}` as Hex;
  const block        = BigInt(`0x${raw.slice(128, 192)}`);

  return { firmwareHash, govPubkey, block };
}

// ── Ed25519 Signature Verification ────────────────────────────────────────

async function verifyEd25519(
  message:   ArrayBuffer,
  signature: ArrayBuffer,
  pubkeyRaw: ArrayBuffer,
): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey(
      "raw",
      pubkeyRaw,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return webcrypto.subtle.verify("Ed25519", key, signature, message);
  } catch {
    return false;
  }
}

// ── Main Attestation Flow ──────────────────────────────────────────────────

export async function attestChip(
  chipHost: string,
  chipUuid: string,
): Promise<AttestationResult> {
  // 1. Generate challenge
  const challenge = generateChallenge(chipUuid);

  // 2. Request attestation from chip
  let response: AttestationResponse;
  try {
    response = await requestAttestation(challenge, chipHost);
  } catch (err) {
    return {
      status: "ERROR",
      chipUuid,
      firmwareHash: "0x" as Hex,
      manifestBlock: 0n,
      reason: `Network error: ${(err as Error).message}`,
    };
  }

  // 3. Check challenge freshness
  const age = Math.floor(Date.now() / 1000) - challenge.issuedAt;
  if (age > CHALLENGE_TTL_S) {
    return {
      status:       "UNTRUSTED",
      chipUuid,
      firmwareHash: response.firmwareHash,
      manifestBlock: response.manifestBlock,
      reason: `Challenge expired (${age}s > ${CHALLENGE_TTL_S}s TTL)`,
    };
  }

  // 4. Verify Ed25519 signature: sign(nonce ++ firmwareHash ++ timestamp)
  const msgBuf  = hexConcat([challenge.nonce, response.firmwareHash,
                              u64ToHex(response.timestamp)]);
  const sigBuf  = hexToBytes(response.signature);
  const pkBuf   = hexToBytes(response.chipPubkey);
  const sigValid = await verifyEd25519(msgBuf, sigBuf, pkBuf);
  if (!sigValid) {
    return {
      status:        "UNTRUSTED",
      chipUuid,
      firmwareHash:  response.firmwareHash,
      manifestBlock: response.manifestBlock,
      reason:        "Ed25519 signature verification failed",
    };
  }

  // 5. Fetch on-chain manifest and compare firmware hash
  const manifest = await fetchOnChainManifest(chipUuid);
  if (!manifest) {
    return {
      status:        "UNTRUSTED",
      chipUuid,
      firmwareHash:  response.firmwareHash,
      manifestBlock: response.manifestBlock,
      reason:        "No manifest found on L1 for this chip UUID",
    };
  }
  if (response.firmwareHash.toLowerCase() !== manifest.firmwareHash.toLowerCase()) {
    return {
      status:        "UNTRUSTED",
      chipUuid,
      firmwareHash:  response.firmwareHash,
      manifestBlock: response.manifestBlock,
      reason: `Firmware hash mismatch: chip=${response.firmwareHash} L1=${manifest.firmwareHash}`,
    };
  }

  return {
    status:        "TRUSTED",
    chipUuid,
    firmwareHash:  response.firmwareHash,
    manifestBlock: response.manifestBlock,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: Hex): ArrayBuffer {
  const h = hex.replace(/^0x/, "");
  const buf = new Uint8Array(h.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return buf.buffer;
}

function hexConcat(hexParts: Hex[]): ArrayBuffer {
  const parts = hexParts.map(h => new Uint8Array(hexToBytes(h)));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out.buffer;
}

function u64ToHex(n: number): Hex {
  const buf = new Uint8Array(8);
  let v = BigInt(n);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return `0x${Buffer.from(buf).toString("hex")}` as Hex;
}

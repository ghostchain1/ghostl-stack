/**
 * Bundle Creator
 * Combines Merkle tree + ZK proof + compression metadata into a GDTP bundle record.
 */
import { createHash } from "node:crypto";
import {
  type GDTPBundle,
  type NodeEnvironment,
  BUNDLE_TTL_MS,
  MAX_BUNDLE_TX,
} from "ghost-interplanetary-sdk";
import { buildMerkleRoot } from "./merkleBuilder.js";
import { computeZKProofStub } from "./zkProofStub.js";
import { randomUUID } from "node:crypto";

export interface CreateBundleParams {
  sourceNodeId: string;
  destNodeId:   string;
  priority:     number;
  txHashes:     string[];
  environment:  NodeEnvironment;
}

export interface BundleCreationResult {
  bundle:      GDTPBundle;
  merkleDepth: number;
  zkCommitment: string;
}

export function createBundle(params: CreateBundleParams): BundleCreationResult {
  const maxTx = MAX_BUNDLE_TX[params.environment];
  const txHashes = params.txHashes.slice(0, maxTx);

  const { root: merkleRoot, depth: merkleDepth } = buildMerkleRoot(txHashes);
  const zkResult = computeZKProofStub(txHashes, merkleRoot);

  // Payload hash: deterministic SHA-256 over ordered tx hashes
  const payloadHash = createHash("sha256")
    .update(txHashes.join(""))
    .digest("hex");

  // Simulated compression: assume ~85% ratio (real impl would use zlib/brotli)
  const rawBytes = txHashes.length * 32; // 32 bytes per tx hash
  const compressedBytes = Math.ceil(rawBytes * 0.15);

  const ttlMs = BUNDLE_TTL_MS[params.environment];
  const now = Date.now();

  const bundle: GDTPBundle = {
    id:              randomUUID(),
    sourceNodeId:    params.sourceNodeId,
    destNodeId:      params.destNodeId,
    priority:        params.priority,
    ttlMs,
    txCount:         txHashes.length,
    merkleRoot,
    zkProofHash:     zkResult.proofHash,
    payloadHash,
    compressedBytes,
    createdAt:       now,
    expiresAt:       now + ttlMs,
    status:          "pending",
    hopCount:        0,
    route:           [params.sourceNodeId],
  };

  return { bundle, merkleDepth, zkCommitment: zkResult.commitment };
}

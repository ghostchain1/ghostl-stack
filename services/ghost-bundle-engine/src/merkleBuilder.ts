/**
 * Merkle Tree Builder
 * Computes Merkle root over a list of transaction hashes for GDTP bundles.
 */
import { createHash } from "node:crypto";

function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hashPair(left: string, right: string): string {
  // Sort pair to make tree order-independent (like Bitcoin's implementation)
  const [a, b] = left <= right ? [left, right] : [right, left];
  return sha256hex(a + b);
}

export interface MerkleResult {
  root: string;
  depth: number;
  leafCount: number;
}

/**
 * Build Merkle tree over `leaves` and return the root.
 * Each leaf is hashed once before being added to the tree.
 */
export function buildMerkleRoot(leaves: string[]): MerkleResult {
  if (leaves.length === 0) {
    return { root: sha256hex("empty"), depth: 0, leafCount: 0 };
  }

  let level = leaves.map((l) => sha256hex(l));
  let depth = 0;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = (level[i + 1] ?? left) as string; // duplicate last node if odd count
      next.push(hashPair(left, right));
    }
    level = next;
    depth++;
  }

  return { root: level[0] as string, depth, leafCount: leaves.length };
}

/** Verify that a single leaf is part of a tree with the given root using a proof path. */
export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let current = sha256hex(leaf);
  for (const sibling of proof) {
    current = hashPair(current, sibling);
  }
  return current === root;
}

/**
 * ghost-bundle-engine — Fastify App (port 7984)
 * Merkle + ZK proof bundle construction and verification.
 */
import Fastify from "fastify";
import {
  SubmitBundleSchema,
  BundleVerifySchema,
} from "ghost-interplanetary-sdk";
import { createBundle } from "./bundleCreator.js";
import { buildMerkleRoot, verifyMerkleProof } from "./merkleBuilder.js";
import { verifyZKProofStub } from "./zkProofStub.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Health ─────────────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    service: "ghost-bundle-engine",
    version: "1.0.0",
    port: 7984,
    zkMode: "stub",   // upgrade to "groth16" or "sp1" in production
    timestamp: Date.now(),
  }));

  // ── Bundle Creation ────────────────────────────────────────────────

  app.post("/bundles/create", async (req, reply) => {
    const parse = SubmitBundleSchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const { sourceNodeId, destNodeId, priority, txHashes, environment } = parse.data;
    const result = createBundle({ sourceNodeId, destNodeId, priority, txHashes, environment });
    return {
      ok: true,
      bundle:       result.bundle,
      merkleDepth:  result.merkleDepth,
      zkCommitment: result.zkCommitment,
    };
  });

  // Compress only — no ZK proof, just Merkle root + payload hash
  app.post("/bundles/compress", async (req, reply) => {
    const body = req.body as { txHashes?: unknown };
    if (!Array.isArray(body?.txHashes)) return reply.status(400).send({ error: "txHashes array required" });
    const txHashes = (body.txHashes as unknown[]).filter((h): h is string => typeof h === "string");
    if (txHashes.length === 0) return reply.status(400).send({ error: "No valid tx hashes" });
    const merkle = buildMerkleRoot(txHashes);
    return { ok: true, merkleRoot: merkle.root, depth: merkle.depth, leafCount: merkle.leafCount };
  });

  // ── Bundle Verification ────────────────────────────────────────────

  app.post("/bundles/verify", async (req, reply) => {
    const parse = BundleVerifySchema.safeParse(req.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });
    const { merkleRoot, zkProofHash: _zkProofHash, txHashes } = parse.data;

    // Recompute Merkle root and compare
    const computed = buildMerkleRoot(txHashes);
    const merkleValid = computed.root === merkleRoot;

    // Verify ZK commitment (stub: re-derive commitment from inputs)
    // The zkProofHash passed here is the proofHash; we check the commitment separately
    const zkValid = verifyZKProofStub(txHashes, merkleRoot, merkleRoot); // commitment is the merkle root in stub mode

    return {
      ok: merkleValid && zkValid,
      merkleValid,
      zkValid,
      computedRoot: computed.root,
    };
  });

  // Verify a single Merkle proof path
  app.post("/merkle/verify-proof", async (req, reply) => {
    const body = req.body as { leaf?: unknown; proof?: unknown; root?: unknown };
    if (typeof body?.leaf !== "string" || !Array.isArray(body?.proof) || typeof body?.root !== "string") {
      return reply.status(400).send({ error: "leaf (string), proof (string[]), root (string) required" });
    }
    const proof = (body.proof as unknown[]).filter((p): p is string => typeof p === "string");
    const valid = verifyMerkleProof(body.leaf, proof, body.root);
    return { ok: valid, leaf: body.leaf, root: body.root };
  });

  return app;
}

# GhostChain ZK Finality Upgrade (Stub)

Goal: keep the OP Stack architecture while adding a validity-proof path for batches so GhostL2 can optionally finalize via ZK (Polygon CDK/zkEVM style) without changing execution.

## Contract Hook (stub)
- Deploy a `ZkBatchVerifier` on L1 that exposes `verifyBatch(bytes proof, bytes32 batchRoot, uint256 l1BlockNumber) -> bool`.
- Extend the rollup pipeline so each OP batch commitment (currently posted by the proposer to `DisputeGameFactory`) is also hashed and emitted to `ZkBatchVerifier`.
- Add a storage slot on L1 (or a sidecar contract) to record `verifiedRoot` per batch id.
- Settlement rule: batch is considered final if (a) fraud window passes, or (b) `verifiedRoot[batchId] == batchRoot`.

## Rollup Config Changes (plan)
- Add a flag `zk_finality_enabled` and `zk_verifier_address` to `rollup.json`.
- Permit proposer to include an optional `zkProof` blob when posting outputs; contract forwards to `ZkBatchVerifier`.
- Record the proof status in the batch metadata so challengers can skip fraud disputes on already-proven batches.

## Prover Path (CDK/zkEVM alignment)
- Use CDK/zkEVM prover to generate proofs over OP execution traces; map OP batch calldata to zkEVM input.
- Batcher emits a sidecar file per batch with calldata + state root to feed prover.
- Proof submission can be async; verifier enforces L1 block number bounds to prevent replay.

## L3 Implications
- L3s settling on GhostL2 inherit ZK finality once GhostL2 batches are proven.
- Optional: allow L3s to post their own proofs to GhostL2 with a similar `zk_verifier_address` hook.

## Next Steps
- Implement `ZkBatchVerifier` stub contract and add `zk_verifier_address` to `rollup.json`.
- Extend proposer CLI to accept `--zk-proof` and mark batches as “proven” in metadata.
- Add observability: metrics for proof submissions, verifier successes/failures, and “zk-finalized” batch counts.

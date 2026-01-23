# ZK Compliance Attestations

## Goal
Provide privacy-preserving compliance proofs without storing PII. Proofs are represented as hashes and issuer references.

## Interface
- `ProofVerifier` interface accepts a `ProofInput` and returns `VERIFIED | UNVERIFIED | INVALID`.
- Default verifier is hash-only and marks proofs `UNVERIFIED` until a concrete ZK verifier is configured.

## Storage
Attestations are stored in `pil_compliance_proofs` with:
- `subject_hash`
- `issuer_id`
- `statement`
- `proof_hash`
- `jurisdiction_code`
- `status`

## Hooks
- RPC preflight (Phase 3) will request proofs and verify eligibility.
- Bridge, treasury, and governance guards will reference attestation hashes on-chain.

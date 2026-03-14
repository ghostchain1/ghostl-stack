# Ghost Docker Control (Recreate + Rollback)

This directory contains guarded scripts to recreate containers without chain data loss and to rollback to a captured snapshot. The scripts do **not** delete volumes and never run `docker system prune`.

## Commands

```
./ops/docker/ghostctl-recreate.sh --rolling --mode prod --yes
./ops/docker/ghostctl-rollback.sh ./ops/docker/snapshots/<timestamp>
```

## Flags

- `--rolling`: Recreate services one-by-one (recommended).
- `--mode dev|prod`: Environment label for attestations.
- `--dry-run`: Perform checks and snapshot only.
- `--yes`: Skip confirmation prompt.
- `--no-rollback`: Disable auto-rollback on failure.

## Safety Guarantees

- Chain data volumes are preserved and fingerprinted before/after.
- Gas token address is verified across L1/L2/L3 configs.
- Rollback uses the snapshot compose files and restores container state without touching chain data.

## Required Tools

- `docker` + `docker compose`
- `python3`
- `openssl` (for signing and DID VC generation) or `gpg` (optional)

## Attestation Keys

Set one of:

- `GHOST_ATTEST_PRIVATE_KEY=<path>` and optionally `GHOST_ATTEST_PUBLIC_KEY=<path>`
- `GHOST_ATTEST_GPG_KEY=<gpg-key-id>`

Without a signing key, the recreate script will abort.

## TPM Signing

If `tpm2-tools` are available, the recreate script will sign the immutability attestation using a TPM-backed key and emit `immutability-attestation.tpm.sig` plus `tpm-public-key.pem`. If TPM is unavailable, GPG/OpenSSL signing is used.

## DID Attestations (Verifiable Credential)

The recreate script generates a DID-based Verifiable Credential that binds the immutability attestation to a DID controller.

Defaults (did:key):
- `GHOST_DID_METHOD=key`
- `GHOST_DID_KEY_PATH` (optional, defaults to `ops/docker/attestations/did-ed25519.pem`)
- `GHOST_DID_PUB_PATH` (optional, defaults to `ops/docker/attestations/did-ed25519.pub.pem`)

Optional (did:web):
- `GHOST_DID_METHOD=web`
- `GHOST_DID` (e.g. `did:web:example.com`)
- `GHOST_DID_VERIFICATION_METHOD` (e.g. `did:web:example.com#key-1`)
- `GHOST_DID_KEY_PATH` / `GHOST_DID_PUB_PATH`

Generated artifacts:
- `ops/docker/attestations/did-key.json`
- `ops/docker/attestations/immutability-vc.json`
- `ops/docker/attestations/immutability-vc.payload.json`
- `ops/docker/attestations/immutability-vc.sig`

## OCI Image Provenance (SLSA)

The recreate script generates `ops/docker/attestations/oci-image-provenance.json` to record image digests, Dockerfile checksums, build args, and container bindings before/after recreate.

## Chain State Merkle Proofs

The recreate script writes `chain-state-merkle-proofs.json` and `chain-state-merkle-proofs-post.json` to the attestation directory and enforces block hash/state root continuity for the captured block height.

## AI Anomaly Detection

An anomaly report is generated at `ops/ai/anomaly/anomaly-report.json` with deterministic, rule-based severity classification. CRITICAL anomalies trigger the kill-switch and rollback.

## Drift Monitoring

After recreate, the drift monitor records a baseline and produces `ops/ai/drift/drift-report.json`. CRITICAL drift triggers the kill-switch. Configure thresholds in `ops/ai/drift/drift-policy.json`.

## MEV / Sequencer Monitoring

The MEV monitor emits `ops/mev/mev-report.json` and flags ordering anomalies or extreme priority fee skew. CRITICAL severity triggers the kill-switch.

## Threat Modeling (STRIDE / LINDDUN)

Threat models are generated via `ops/ai/threat-model/generate.sh` and stored in the snapshot:
- `stride-model.md`
- `linddun-model.md`
- `risk-summary.json`

CRITICAL severity aborts the recreate pipeline.

## Compliance Evidence Packaging (ISO/SOC)

Evidence bundles are produced by `ops/compliance/bundle.sh` using `ops/compliance/controls-map.json`. Output is stored in the snapshot as `evidence-bundle.json`.

## Geo-Risk Quorum Selection

Geo-risk scoring and quorum rotation are handled via `ops/geo-risk/select-quorum.sh`, producing `quorum-selection.json`.

## Confidential Compute Attestation

If SEV/TDX capabilities are detected, `ops/confidential/cca.json` is generated and hashed into the immutability attestation. If unavailable, the script records `supported=false`.

## ZK Immutability Proofs

The recreate script generates `ops/zk/immutability-proof.json` and `ops/zk/immutability-proof.verifier.json` using `circom` + `snarkjs`. The proof is submitted on-chain via a pre-signed raw transaction (`GHOST_ZK_VERIFY_RAW_TX`), and the receipt is stored at `ops/zk/immutability-proof.onchain.json`.

Required env for ZK:
- `ZK_PTAU_PATH` (Powers of Tau file)
- `ZK_ENTROPY` (deterministic contribution seed)
- `GHOST_ZK_VERIFY_RAW_TX` (pre-signed on-chain verification tx)
- `ZK_ONCHAIN_REQUIRED=true|false` (default true)

## Recursive ZK Proof

After quorum attestation, a constant-size recursive proof is generated from immutability, MEV, quorum, compliance, and gas-token hashes. The proof is submitted on-chain with `GHOST_RECURSIVE_VERIFY_RAW_TX`.

## Formal Verification

The recreate pipeline runs `ops/zk/formal-verify.sh` to compile circuits, generate witnesses, and validate constraint correctness. Failures abort the run.

## On-Chain Notarization

The notarization helper computes a notarization hash (including the recursive proof) and optionally submits a pre-signed transaction when `GHOST_NOTARIZATION_RAW_TX` is provided. Output is stored in `ops/onchain/notarization.json`.

## Cross-Chain Anchoring (L1/L2/L3)

After the recursive proof is generated, `ghostctl-recreate.sh` calls `ops/onchain/anchor-crosschain.sh` to anchor the attestation bundle across L1/L2/L3. The anchor status is stored in `ops/onchain/cross-chain-anchors.json` and copied into the snapshot as `cross-chain-anchors.json`.

Use:

```
GHOST_ANCHOR_L1_RAW_TX=0x... \
GHOST_ANCHOR_L2_RAW_TX=0x... \
GHOST_ANCHOR_L3_RAW_TX=0x... \
./ops/onchain/anchor-crosschain.sh \
  --attestation ./ops/docker/attestations/immutability-attestation.json \
  --recursive ./ops/zk/recursive-proof.json \
  --out ./ops/onchain/cross-chain-anchors.json
```

Anchoring is required by default. Set `CROSS_CHAIN_ANCHOR_REQUIRED=false` to allow a `skipped` status (not recommended in production).

## Autonomous Policy Self-Healing

`ghostctl-recreate.sh` runs `ops/policy/self-heal.sh` to evaluate policy state, attempt safe repairs, and emit:
- `policy-state.json`
- `healing-actions.json`
- `self-heal-log.json`

CRITICAL policy severity triggers the kill switch and aborts the recreate pipeline unless `POLICY_SELF_HEAL_REQUIRED=false`.

## Satellite / Offline Quorum Nodes

Offline attestations are synced via `ops/satellite/sync.sh`. The pipeline requires a `synced` status unless `SATELLITE_REQUIRED=false`.

Artifacts:
- `offline-attestations.json`
- `sync-log.json`

## zkML Policy Learning

`ops/zkml/learn.sh` produces a policy update proposal and a zkML proof reference. If `ZKML_REQUIRED=true`, a `verified` proof is required (supply via `ZKML_PROOF_PATH`).

Artifacts:
- `zkml-model-proof.json`
- `zkml-policy-update.json`
- `zkml-learning-log.json`

## Governance Enforcement

`ops/governance/enforce.sh` enforces governance rules and can submit a governance event using a pre-signed raw transaction.

Artifacts:
- `governance-enforcement.json`

Env:
- `GHOST_GOVERNANCE_EVENT_RAW_TX`
- `GHOST_GOVERNANCE_RPC_URL`

## Quorum Attestation

Cross-region quorum attestations are aggregated from `ops/quorum/regions/*.json`. The aggregate is stored at `ops/quorum/quorum-attestation.json` and must satisfy `ops/quorum/quorum-policy.json` unless `QUORUM_REQUIRED=false`.

## Kill Switch

Manual activation:

```
./ops/security/kill-switch/activate.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod --reason \"manual\"
```

Release:

```
./ops/security/kill-switch/release.sh --mode prod --reason \"cleared\"
```

## Final Report

Each recreate run emits:
- `ops/docker/snapshots/<timestamp>/final-report.json`
- `ops/docker/snapshots/<timestamp>/final-report.md`

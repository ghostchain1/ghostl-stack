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

## Kill Switch

Manual activation:

```
./ops/security/kill-switch/activate.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod --reason \"manual\"
```

Release:

```
./ops/security/kill-switch/release.sh --mode prod --reason \"cleared\"
```

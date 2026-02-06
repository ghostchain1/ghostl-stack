# Phase 6 Release Notes (Mission Phases 2–6)

Date (UTC): `2026-02-06`

## Canonical git references

- **Phase 2–6 baseline (single-SHA lock):** tag `phase2-6-lock-2026-02-06`
  - Points to commit: `6bc989d0d886efe79c28c64628eea5bff25b92a1`
- **Attestation refresh + full-host runbook:** commit `7dced9b368d3d7939d941b6055bfe11afa95d170`

## Phase 6 (“go/no-go”) outcomes in this environment

This harness supports **dry-run validation** (code + static gates) but cannot reliably validate:

- live RPC health/load/restart behavior (L1/L2/L3)
- docker runtime launch correctness and network isolation under a real daemon
- external bridge execution to Ethereum/Bitcoin/etc

See the attestation artifacts for the precise scope.

## Evidence packs (clean-run)

Generated on `2026-02-06` with a clean tree at commit `6bc989d0…` (see each pack’s `provenance/provenance.json`):

- L1: `infra/evidence/out/evidence-pack-l1-20260206T034922Z.zip`
  - SHA256: `a94a294e2eadcc9d2d1f8215dbc38ce31862f96c00dfdc7d866831234efbbc3d`
- L2: `infra/evidence/out/evidence-pack-l2-20260206T035002Z.zip`
  - SHA256: `86c27514b5f90cbcfabc27aa40fcdc6253e5c32ac1fd37ee2c2663e058e9a600`
- L3: `infra/evidence/out/evidence-pack-l3-20260206T035019Z.zip`
  - SHA256: `03830112e02108dab78cf464075e2857e94c3bac6c3e2c710739262715faef3e`

## Attestation artifacts

- Phase 6 checklist (human-readable): `ops/attestations/phase6-attestation-checklist.md`
- Phase 6 checklist (machine-readable): `ops/attestations/phase6-attestation.json`

## Full-host “no-skips” validation

To obtain a production-grade decision, run on a real host:

- Runbook: `ops/runbooks/full-host-go-no-go.md`
- Runner script: `ops/runbooks/full-host-go-no-go.sh`

## Governance non-bypassability proof guide

Concrete walk-through (contracts + tests + invariants):

- `docs/security/governance-non-bypassability.md`


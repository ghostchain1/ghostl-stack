# ZK Solvency

## Goal

Provide a proof-ready solvency flow for Ghost treasury:

- Assets commitments
- Liabilities commitments
- Net position commitment
- Governance-gated on-chain verification

Invariant: `assets >= liabilities`

## Runtime Snapshot API

Treasury engine endpoints:

- `POST /v1/treasury/solvency/snapshot`
- `POST /v1/treasury/solvency/verify`
- `GET /v1/treasury/solvency/latest`

Artifacts are written to:

- `artifacts/solvency/solvency-epoch-<epoch>.json`

## Deterministic Witness

Generate a circuit input from a snapshot artifact:

```bash
node ops/zk/solvency-witness.mjs \
  --snapshot artifacts/solvency/solvency-epoch-000001.json \
  --out ops/zk/build-solvency/input.json
```

## Proof Generation

```bash
ZK_PTAU_PATH=/path/to/powersOfTau.ptau \
ZK_ENTROPY=deterministic-seed \
bash ops/zk/solvency-prove.sh \
  --snapshot artifacts/solvency/solvency-epoch-000001.json \
  --out-proof ops/zk/solvency-proof.json \
  --out-vkey ops/zk/solvency-vkey.json
```

## On-chain Integration

- `contracts/src/treasury/SolvencyVerifier.sol` verifies proofs.
- `contracts/src/treasury/SovereignTreasuryEngine.sol` accepts solvency proofs via:
  - `submitSolvencyProof(...)`
  - optional staleness enforcement via `setSolvencyMaxAgeSeconds(...)`.

When `solvencyMaxAgeSeconds > 0`, allocation execution is blocked if proof is stale.

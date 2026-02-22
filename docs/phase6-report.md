# Phase 6 — Proposer Configuration Gate

Date: 2026-02-21

## Goal
Validate proposer configuration safety before runtime:
- proposer rollup RPC configured,
- proposer parent RPC configured,
- target contract address is non-zero and deployed on parent chain,
- output-oracle mode supports `version()` preflight.

## Changes delivered

### 1) Added proposer gate validation script
File:
- `infra/opstack/scripts/validate-proposer-config.sh`

Checks performed:
- Compose-level proposer args:
  - `op-proposer` has `--rollup-rpc` and `--l1-eth-rpc`
  - `l3-op-proposer` has `--rollup-rpc` and `--l1-eth-rpc`
- Parent chain contract-code validation (`eth_getCode`) for both proposer targets.
- Legacy output-oracle mode check: `eth_call version()` must return non-empty.

Mode support:
- Fault-proof mode (current stack): validates `game-factory-address` presence and bytecode.
- Output-oracle mode (legacy): validates oracle address + `version()` response.

### 2) Evidence capture for proposer wiring
- Extracted both proposer sections from compose files for traceable proof of arguments.
- Added Phase 6 evidence index for reproducibility.

## Validation + evidence
- Script syntax: `evidence/phase6/phase6-script-syntax.txt`
- Gate execution: `evidence/phase6/proposer-config-gate.txt`
- Gate status: `evidence/phase6/gate-status.txt`
- Compose excerpts: `evidence/phase6/proposer-compose-sections.txt`
- Smoke run: `evidence/phase6/smoke-consensus-autonomy.txt`
- Index: `evidence/phase6/README.md`

## Gate 6 assessment
Gate rule: proposer configuration is explicitly validated against parent-chain contract availability and required RPC wiring.

Status: **PASS**

Reason:
- Gate script completed with `ok=true`, `failures=0` for both L2 and L3 proposer paths.
- Current configuration is fault-proof mode and both proposer targets have on-parent bytecode.
- Smoke validation remains green after introducing the Phase 6 gate script.

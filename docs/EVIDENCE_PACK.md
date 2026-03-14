# Liquidity Gravity Engine (LGE) — Evidence Pack

This document describes the evidence artifacts produced by the Liquidity Gravity Engine and how to use them for audits, incident review, and regulatory inquiries.

## What counts as evidence

1. **On-chain events (canonical)**
   - `LoadBalancerVault`: deposits, withdrawals, deployments, unwinds
   - `SettlementOracle`: principal records, settlement submissions, overdue penalties, slashing events
   - `RewardRouter`: queued/activated configs and yield distributions
   - `CircuitBreaker`: pauses, rate-limit consumption

2. **Off-chain signed audit log (append-only)**
   - Location: `artifacts/audit/liquidity-router/`
   - Format: JSONL (one JSON object per line)
   - Each record includes:
     - `policySnapshotHash`
     - action type (deploy/settlement)
     - tx hash (if executed)
     - commitment hash and sequence (for settlement)
     - an operator signature over a stable JSON encoding (`digest`, `signature`)

3. **Attestations / build metadata**
   - Location: `artifacts/attestations/` (recommended)
   - Contents should include:
     - container image digests
     - build inputs (git commit, tool versions)
     - deployment addresses and network IDs

## Settlement proofs (MVP)

MVP uses threshold ECDSA attestations. For each settlement:

- The oracle exposes `digestSettlement(...)` which computes the digest that relayers sign.
- The router includes signatures in `submitSettlement(...)`.
- Replay protection is enforced by sequence numbers per adapter.

## Governance trail

Governance proposals are generated as artifacts:

- Location: `artifacts/governance/liquidity-gravity/proposals/`
- Files:
  - `*.json`: proposal payload (calls, executor calldata)
  - `*.calldata.txt`: executor calldata blob
  - `*.md`: human-readable summary

These artifacts are intended to be:

- human-reviewable before submission
- reproducible (calldata can be regenerated from the JSON)

## How to export audit logs

- Use: `node --experimental-strip-types tools/liquidityctl/src/cli.ts export-audit`

## Verification checklist

- Confirm contract bytecode matches expected source build.
- Confirm adapter config and caps match governance decisions.
- Confirm each settlement’s asset transfer matches on-chain recorded amounts.
- Confirm reward distributions match configured BPS splits.
- Confirm router audit log signatures verify against the configured operator key.


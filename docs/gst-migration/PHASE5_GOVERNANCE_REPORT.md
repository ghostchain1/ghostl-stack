# Phase 5 (Governance Lock + Calldata) Report

Date (UTC): 2026-02-16

## 1. What Was Scanned (Paths)

- `contracts/src/governance/constitutions/GSTConstitution.sol`
- `contracts/scripts/build-gst-constitution-proposal.ts`
- `services/stack.env`
- `infra/opstack/.env`
- `contracts/reports/policy_primitives_status.json`
- `docs/gst-migration/PROPOSAL-CALLDATA.json`

## 2. What Changed (Minimal Diffs)

- Extended on-chain GST constitution keys in:
  - `contracts/src/governance/constitutions/GSTConstitution.sol`
  - Added clauses/policies for:
    - GST-only across L1/L2/L3
    - no legacy ETH branding surfaces
    - required GST leakage gate before release
    - required GST Foundry invariants before release
    - governance-only native metadata updates
- Updated deterministic proposal builder:
  - `contracts/scripts/build-gst-constitution-proposal.ts`
  - Emits policy writes for all new constitutional requirements.
- Added governance target inventory:
  - `docs/gst-migration/GOVERNANCE-TARGETS.md`
- Regenerated deterministic calldata:
  - `docs/gst-migration/PROPOSAL-CALLDATA.json`

## 3. Commands Run

```bash
npm --prefix contracts run proposal:gst-constitution
sha256sum docs/gst-migration/PROPOSAL-CALLDATA.json
npm --prefix contracts run -s proposal:gst-constitution >/tmp/gst-proposal-rerun.log
sha256sum docs/gst-migration/PROPOSAL-CALLDATA.json
bash scripts/gst-leakage-gate.sh
```

## 4. Expected Output

- Proposal builder prints:
  - `[gst-constitution] calls: 18`
  - output path and executor address.
- First and second SHA256 checksums are identical (deterministic calldata).
- Leakage gate remains green.

## 5. Rollback Plan (Git-Based)

```bash
# Safe rollback in shared history:
git revert <phase5-commit-sha>

# If local-only and you want to keep edits but remove the commit:
git reset --mixed HEAD~1
```

# Security Decision Log

This log captures security-relevant implementation decisions and their rationale.

## 2026-02-05 — Slither build isolation + gating policy

- **Decision:** Run Slither against a dedicated, fresh Foundry build (`contracts/out-slither/`) generated offline on each run.
- **Rationale:** Prevent “source out-of-sync with build artifacts” false results and avoid cross-contamination from other build commands (tests, formal tooling).
- **Gate:** Block on `High`, and on `Medium` except `unused-return` (tracked but non-blocking). Rationale: `unused-return` is dominated by tuple-unpack and bytes-return ignores; security-relevant ignored ERC20 return values remain unacceptable in core paths.

## 2026-02-05 — Treasury epoch budget enforced at consumption point

- **Decision:** Enforce `epochSpent + amount <= epochBudget` inside `TreasuryPolicy.consumeBudget(...)`.
- **Rationale:** Budget invariants must hold even under adversarial/misuse sequences; Foundry invariant testing found a counterexample when budget consumption was not bounded.


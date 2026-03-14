# Meta-Governance CI Layer

## Overview

The **Meta-Governance CI layer** extends GhostChain's constitutional enforcement beyond
infrastructure security into the full governance stack: post-quantum crypto, brand integrity,
offline bundles, and on-chain constitutional contract invariants.

---

## Policy Gate Jobs (`.github/workflows/policy-gate.yml`)

| Job # | Job ID | Enforcement |
|-------|--------|-------------|
| 1 | `kong-admin-not-public` | Kong admin ≠ 0.0.0.0:8001 |
| 2 | `no-trust-forward-header` | trustForwardHeader=false everywhere |
| 3 | `no-insecure-defaults` | No `change-me`/`ghostpass` secrets in prod compose |
| 4 | `no-npm-install-in-compose` | All containers use `npm ci` |
| 5 | `prod-images-digest-pinned` | Images have `@sha256:` digest pins |
| 6 | `routing-law` | L3→L2→L1 routing law |
| 7 | `compose-hardening-full` | cap_drop, no-new-privileges, healthchecks |
| 8 | `pq-stub-status` | PQ crypto package exists, migration doc present |
| 9 | `brand-enforcement-scan` | GST symbol/leakage gates + brand spec.json valid |
| 10 | `governance-bundle-integrity` | Governance bundle package + tests pass |
| 11 | `safeops-allowlist-review` | Allowlist reviewed; high-risk actions flagged |
| 12 | `policy-gate-passed` | Aggregator — all must pass to merge |

---

## Atomic CI Gates (`.github/workflows/atomic-ci.yml`)

Sequenced to enforce: **validate → lint → test → build** — Docker only builds when ALL pass.

| Gate | Job | Waits for |
|------|-----|-----------|
| 1 | `gate-dependency-integrity` | — |
| 2 | `gate-lint-typecheck` | Gate 1 |
| 3 | `gate-security-policy` | Gate 1 |
| 4 | `gate-tests` | Gate 2 |
| 4.5 | `gate-constitutional-contracts` | Gate 2 (Foundry tests) |
| 4.6 | `gate-new-package-tests` | Gate 1 (pq-crypto + governance-bundle) |
| 5 | `docker-build-validated` | Gates 1+2+3+4+4.5+4.6 |

---

## Constitutional Contract Testing

Gate 4.5 runs Foundry tests against all contracts in `contracts/test/constitutional/`:

- `RoutingLaw.t.sol` — 12 tests (valid routes, L3→L1 violation, external egress)
- `BrandingInvariant.t.sol` — 15 tests (canonical brand, legacy detection, isCanonicalBrand)
- `TreasuryInvariant.t.sol` — 12 tests (buyback/burn bounds, reserve min, daily spend)
- `GovernanceExecutor.t.sol` — 12 tests (OGB proof, replay protection, access control)

---

## Brand Enforcement Checks

Gate 9 (`brand-enforcement-scan`) runs three checks:

1. **`scripts/gst-symbol-gate.sh`** — Scans for "ETH" symbol bleeding into GST contexts
2. **`scripts/gst-leakage-gate.sh`** — Detects ETH/Ether leakage in token metadata and contracts
3. **`docs/brand/spec.json`** validation — Must contain `name="Ghost"`, `symbol="GST"`, `decimals=18`

---

## PQ Migration Gate

Gate 8 (`pq-stub-status`) enforces:

- `packages/pq-crypto/index.js` must exist
- `docs/pq-migration.md` must exist
- If `IS_STUB=true`, emits a WARN (not failure — until 2026 Q3 deadline)
- After 2026 Q3: the gate will be upgraded to FAIL on stub

Monitor: `packages/pq-crypto/package.json#pqNote`

---

## Governance Bundle Integrity

Gate 10 (`governance-bundle-integrity`) verifies:

| Required file | Purpose |
|---------------|---------|
| `packages/governance-bundle/index.js` | Core bundle API |
| `packages/governance-bundle/package.json` | Package metadata |
| `packages/governance-bundle/test/bundle.test.js` | Test suite |
| `services/dtn-relay/src/index.js` | DTN relay |
| `packages/dtn-cli/src/cli.js` | CLI tooling |
| `docs/dtn-governance-spec.md` | Specification |
| `infra/safeops/allowlist.yml` | SafeOps config |

Runs `node --test packages/governance-bundle/test/bundle.test.js` — must pass.

---

## SafeOps Allowlist Review

Gate 11 (`safeops-allowlist-review`) flags:

- High-risk actions in allowlist: `RESTART_SERVICE`, `ROTATE_SECRET`, `EMERGENCY_HALT`, `APPLY_CONFIG_PATCH`
- Emergency halt status
- Missing allowlist file (hard fail)

PRs touching `infra/safeops/allowlist.yml` are automatically flagged by this gate.
Manual security review is required before merge.

---

## Adding New Checks

1. Add new job to `policy-gate.yml` with `permissions: { contents: read }` only
2. Add the new job name to `policy-gate-passed.needs` array
3. Add corresponding Foundry test if on-chain, or shell check if infrastructure
4. Document in this file
5. Add to `tests/security/sovereign-regression.test.mjs` (offline check)

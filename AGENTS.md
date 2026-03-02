# GhostStack — Autonomous Agent Operating Rules

This file governs how AI coding agents (GitHub Copilot, Codex, etc.) interact with the GhostStack repository. All agents **must** follow these rules.

---

## 1. Routing Law (Hard, Non-Negotiable)

```
L3 → L2 only
L2 → L1 (GhostChain root) only
L3 → L1 direct: FORBIDDEN
```

Every agent change that touches cross-chain messaging, bridge adapters, or deploy scripts **must preserve this invariant**. CI enforces it via `.github/workflows/ghostcontract-ai.yml` job `routing-law`.

---

## 2. Diff-Only Changes

- Never rewrite files wholesale. Make **minimal targeted diffs**.
- Do not touch unrelated files to fix a failing test.
- When modifying a Solidity contract, update **only** the changed function and its natspec.
- Always add tests that cover new functionality; never remove existing tests.

---

## 3. Atomic Commits, Grouped by Phase

| Phase | Scope | Example commit prefix |
|---|---|---|
| Phase 0 | Discovery, no file changes | `chore(discovery):` |
| Phase 1 | Architecture docs, diagrams | `docs(arch):` |
| Phase 2 | Solidity contracts + tests | `feat(contracts):` |
| Phase 3 | TypeScript service | `feat(service):` |
| Phase 4 | Policy gate, YAML constraints | `feat(policy):` |
| Phase 5 | Observability, evidence | `feat(observability):` |
| Phase 6 | CI/CD, Docker | `ci:` |
| Phase 7 | Docs, runbooks | `docs:` |

Each phase's changes go in **one commit per phase**. Do not mix contract changes with service changes in a single commit.

---

## 4. Phased Execution Order

Phases must execute in order. Do **not** create deploy scripts (Phase 2) before contracts are reviewed. Do **not** push CI workflows (Phase 6) before service typechecks pass (Phase 3).

Minimum gates before marking a phase complete:
- **Phase 2**: `forge build` passes, `forge test` passes
- **Phase 3**: `tsc --noEmit` passes
- **Phase 6**: Docker build succeeds, health endpoint returns 200

---

## 5. GhostContractAI System

The following contracts are the root authority for smart-contract lifecycle operations. Agents must not bypass them:

| Contract | Address Source | Purpose |
|---|---|---|
| `GhostContractRegistry` | `GHOSTAI_REGISTRY_ADDRESS` env | Deployment registry, routing enforcement |
| `GhostUpgradeGovernor` | `GHOSTAI_GOVERNOR_ADDRESS` env | Upgrade governance, timelock |
| `GhostPolicyGate` | `GHOSTAI_POLICY_GATE_ADDRESS` env | Policy hash commitments |
| `GhostRiskOracle` | `GHOSTAI_RISK_ORACLE_ADDRESS` env | AI risk attestations (EIP-712) |

---

## 6. Secret Hygiene

- Never print private keys, mnemonics, Vault tokens, or RPC auth credentials in logs or commit messages.
- The logger in `services/ghostcontract-ai/src/logger.ts` redacts structural fields automatically. Use it; do not bypass it.
- If adding new secret-carrying env vars, update the REDACT list in `logger.ts`.

---

## 7. File Creation Rules

- All Solidity files: `SPDX-License-Identifier: UNLICENSED`, pragma `0.8.24`.
- All TypeScript service files: ESM (`"type": "module"`), NodeNext resolution, `node >=22.21.0 <23`.
- New services: add to `pnpm-workspace.yaml`, assign next sequential port after 7610.
- New contracts: add `forge build` coverage in CI.

---

## 8. Emergency / Break Glass

If you encounter a governance emergency (routing law bypass in production, critical Slither HIGH finding post-deploy):

1. Call `GhostUpgradeGovernor.emergencyPause(reason)` with GUARDIAN_ROLE key.
2. File a post-mortem in `docs/postmortems/YYYY-MM-DD-incident.md`.
3. Do **not** resume operations until liftQuarantine is approved by quorum.

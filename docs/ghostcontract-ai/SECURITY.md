# GhostContractAI — Security Model

## Hard Constraints (Non-Negotiable)

### 1. Routing Law
```
L3 → L2 ONLY (never L3 → L1)
L2 → L1 ONLY (never L2 → external)
L1 is root authority
```
Any violation is a **hard-fail** at every layer: service, contract, CI.

### 2. No Key Material in Logs
The logger redacts these field names automatically:
`key`, `privateKey`, `secret`, `token`, `password`, `mnemonic`, `seed`, `pk`, `signer`, `vaultToken`, `signerKey`

Never pass raw key values as structured log fields.

### 3. DRY_RUN Default
`GHOSTAI_DRY_RUN=true` by default. Live deploys require **both**:
- `GHOSTAI_DRY_RUN=false` in environment
- A signed governance approval reference (`approvalRef`) in the request

### 4. No Auto-Approve on Mainnet/Testnet
Upgrade and rollback pipelines always produce **proposals only**. Execution requires:
1. Quorum of `APPROVER_ROLE` holders
2. Time-lock expiry (default 48h–7d depending on risk tier)
3. `EXECUTOR_ROLE` caller passing `actualPolicyHash`

### 5. Policy Hash Must Match
Every deploy/upgrade must present the exact `keccak256` hash of the current `constraints.yaml`. Mismatch hard-reverts on-chain (`GhostPolicyGate.checkAndRecord`).

---

## Key Management

### Production (Vault)
Keys are loaded from HashiCorp Vault transit secrets engine:
```
GHOSTAI_VAULT_ADDR=https://vault.internal
GHOSTAI_VAULT_TOKEN=<hvs.token>           # injected via sealed secret
GHOSTAI_VAULT_SECRET_PATH=secret/ghostcontract-ai/signer
```

### Devnet / CI Only
`GHOSTAI_SIGNER_KEY=0x...` environment variable is accepted **only** in non-production environments. The service logs a warning when this fallback is active.

### Key Rotation
- Rotate signing keys every 90 days (SLSA provenance requirement)
- Revoke old attestor from `GhostRiskOracle.revokeAttestor()`
- Authorize new attestor with `GhostRiskOracle.authorizeAttestor()`

---

## Access Control

### Service RBAC

| Role | HTTP Endpoints |
|---|---|
| `viewer` | GET /*, /health, /metrics |
| `operator` | + POST /pipelines/compile-test, /pipelines/verify |
| `auditor` | + POST /pipelines/security-audit |
| `governor` | + POST /pipelines/deploy, /upgrade, /rollback |

### On-Chain Roles (`GhostUpgradeGovernor`)

- `PROPOSER_ROLE` — create upgrade proposals
- `APPROVER_ROLE` — cast approval votes
- `EXECUTOR_ROLE` — execute queued proposals
- `GUARDIAN_ROLE` — cancel proposals, trigger emergency pause
- `DEFAULT_ADMIN_ROLE` — grant/revoke roles, set config

Use 2-step ownership transfer patterns for admin key transitions.

---

## Risk Score Tiers

| Score Range | Tier | Quorum | Timelock |
|---|---|---|---|
| 0–30 | LOW | 1 | 0h (devnet only) |
| 31–50 | MEDIUM | 2 | 48h |
| 51–70 | HIGH | 3 | 72h + audit |
| 71–100 | QUARANTINE | 5 + council vote | 7 days |

Quarantine is **auto-triggered**. Lift requires `DEFAULT_ADMIN_ROLE` + minimum 3-of-N quorum.

---

## Vulnerability Disclosure

Report security issues to the GhostChain security council.

Do **not** open public issues for vulnerabilities.

Include:
1. Affected contract(s) / service module
2. Severity assessment (HIGH/MEDIUM/LOW per Slither scale)
3. Proof-of-concept transaction or test case
4. Suggested fix as a diff

---

## Audit Checklist (Pre-Mainnet)

- [ ] External smart contract audit completed (HIGH/MEDIUM findings resolved)
- [ ] Slither passes with 0 HIGH, 0 MEDIUM findings
- [ ] All Foundry tests pass including invariant suite
- [ ] Policy hash committed on-chain matches `constraints.yaml` SHA256
- [ ] Routing law invariant tests pass in CI
- [ ] Timelock values reviewed and appropriate for mainnet (>= 48h MEDIUM, 72h HIGH)
- [ ] Multi-sig quorum configured (>= 3-of-5 for mainnet governors)
- [ ] Emergency pause tested on devnet
- [ ] Key rotation procedure documented and tested
- [ ] Evidence pack format validated by compliance team
- [ ] SLSA provenance level reviewed (target L2 minimum)

# Phase 2 — Vault, Secrets, Identity Mapping

Date: 2026-02-21

## Goal
Move secrets usage toward runtime Vault retrieval and make username ↔ wallet mapping explicit, auditable, and operator-accessible.

## Changes delivered

### 1) Vault AppRole support in API integration secrets path
- Added AppRole env support to API config:
  - `VAULT_AUTH_PATH`
  - `VAULT_ROLE_ID`
  - `VAULT_SECRET_ID`
  - `VAULT_NAMESPACE`
- Extended integrations Vault client to:
  - use `VAULT_TOKEN` when provided,
  - otherwise login via AppRole (`auth/approle/login` by default),
  - cache short-lived client tokens and refresh automatically.

Files:
- `apps/api/src/config/env.ts`
- `apps/api/src/services/integrations-store.ts`
- `apps/api/.env.example`

### 2) Identity mapping API + auditability
- Added explicit mapping endpoints:
  - `GET /v1/identity/mappings`
  - `POST /v1/identity/mappings/upsert`
  - `DELETE /v1/identity/mappings?userId=...&walletAddress=...`
- Each write emits dedicated audit events:
  - `identity_mapping:upsert`
  - `identity_mapping:remove`

Files:
- `apps/api/src/modules/identity-access/router.ts`

### 3) Vault automation scaffolding
- Added policy file for API integration secret scope.
- Added bootstrap script for policy + AppRole + initial Secret ID.
- Added rotation script for Secret ID renewal.
- Added API-oriented Vault Agent template.
- Updated Vault documentation with Phase 2 flow.

Files:
- `infra/vault/policies/ghost-api.hcl`
- `infra/vault/bootstrap-approle.sh`
- `infra/vault/rotate-approle-secret-id.sh`
- `infra/vault/api-agent.hcl`
- `infra/vault/README.md`

## Validation + evidence
- API build status: `evidence/phase2/build-status.txt`
- Identity mapping route presence: `evidence/phase2/identity-mapping-endpoints.txt`
- Vault script syntax checks: `evidence/phase2/vault-scripts-check.txt`
- Dry-run execution notes (non-mutating): `evidence/phase2/vault-approle-dryrun.txt`
- Index: `evidence/phase2/README.md`

## Gate 2 assessment
Gate rule: runtime secret retrieval path available, rotation path present, identity mapping tested and auditable.

Status: **CONDITIONAL PASS (operator execution required for live Vault mutation)**

Reason:
- Code and scripts are in place for Vault AppRole bootstrap and rotation.
- Actual Vault mutation steps (bootstrap/rotation against target Vault) were not executed in this run because they require operator credentials and would mutate infrastructure state.

## Operator follow-up (to complete full PASS)
1. Export `VAULT_ADDR` and admin `VAULT_TOKEN` in target env.
2. Run:
   - `bash infra/vault/bootstrap-approle.sh`
   - `bash infra/vault/rotate-approle-secret-id.sh`
3. Inject generated `VAULT_ROLE_ID` / `VAULT_SECRET_ID` into runtime secret distribution mechanism for API containers.
4. Verify API integration config read/write through Vault path `secret/data/ghostl-integrations/*`.

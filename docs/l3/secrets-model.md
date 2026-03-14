# Ghost L3 Secrets Model

This document defines how Ghost L3 obtains secrets and how they are validated before services start.

## Sources

Ghost L3 supports two sources for secrets:

1. **Vault (production)**
   - `L3_SECRETS_SOURCE=vault`
   - Require `VAULT_ADDR` + `VAULT_TOKEN` or `VAULT_ROLE_ID` + `VAULT_SECRET_ID`.
   - Vault agent (or AppRole workflow) renders secrets to files under `L3_SECRETS_DIR`.

2. **Dev overrides (local only)**
   - `L3_SECRETS_SOURCE=dev`
   - Requires `ALLOW_DEV_SECRETS=1`.
   - Keys are read from `infra/opstack/.env.secrets`.

## Required keys

- `sequencer.key`
- `batcher.key`
- `proposer.key`
- `challenger.key` (required only if challenger is enabled)
- `jwtsecret`

## Validation

Use the L3 env sync script to enforce required values and block weak defaults:

```bash
infra/scripts/env-sync-l3.sh
```

Use the L3 doctor script to validate runtime health + secrets:

```bash
infra/scripts/doctor-l3.sh
```

## Production rule

- **Do not** set `ALLOW_DEV_SECRETS=1` in production.
- Require Vault auth and file presence for every L3 service start.

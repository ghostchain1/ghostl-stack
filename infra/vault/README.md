# Vault Integration (GhostChain L1)

This folder provides Vault-backed secrets for GhostChain L1. Secrets are **never** committed; they are rendered into `infra/ghostchain/secrets/` and mounted read-only into containers.

## Required L1 secrets

Vault path: `${VAULT_L1_PATH:-ghostchain/l1}`

Required keys (KV v2):

| Key | Purpose | Target file |
| --- | --- | --- |
| `bootnode_key` | Bootnode identity key | `infra/ghostchain/secrets/boot.key` |
| `node1_key` | L1 validator signer key | `infra/ghostchain/secrets/node1.key` |
| `node2_key` | L1 validator signer key | `infra/ghostchain/secrets/node2.key` |
| `jwtsecret` | Auth RPC JWT secret | `infra/ghostchain/secrets/jwtsecret` |

## AppRole flow (CLI)

1. Export auth env:
   - `VAULT_ADDR`
   - `VAULT_ROLE_ID` + `VAULT_SECRET_ID` **or** `VAULT_TOKEN`
2. Render secrets:
   - `bash infra/vault/render-l1-secrets.sh`
3. Sync L1 env + validate:
   - `bash infra/scripts/env-sync-l1.sh`

## Vault Agent template flow

Use `infra/vault/l1-agent.hcl` with `consul-template`/Vault Agent to materialize secrets directly into `infra/ghostchain/secrets/`. This is preferred for production.

## Dev mode

For local dev, set `L1_SECRETS_SOURCE=dev` and `ALLOW_DEV_SECRETS=1` in `infra/ghostchain/.env.l1`.

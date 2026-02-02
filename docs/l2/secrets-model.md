# Ghost L2 Secrets Model

This document defines how Ghost L2 handles secrets in dev, staging, and production.

## Secrets inventory (L2)

- Sequencer key
- Batcher key
- Proposer key
- Challenger key
- JWT secret (engine auth)
- Optional admin tokens (gate, gas engine)

## Sources of truth

- Canonical env: `infra/opstack/.env.l2`
- Secrets overlay: `infra/opstack/.env.secrets` (dev only; gitignored in production)
- Vault materialization directory: `L2_SECRETS_DIR` (vault mode)

## Modes

### Dev mode

- `L2_SECRETS_SOURCE=dev`
- `ALLOW_DEV_SECRETS=1`
- Secrets must be present in `infra/opstack/.env.secrets`.
- `infra/scripts/env-sync-l2.sh` fails if placeholder secrets are present.

### Vault mode (staging/production)

- `L2_SECRETS_SOURCE=vault`
- Requires `VAULT_ADDR` and `VAULT_TOKEN` **or** `VAULT_ROLE_ID` + `VAULT_SECRET_ID`.
- Vault agent or AppRole must render files into `L2_SECRETS_DIR`:
  - `sequencer.key`
  - `batcher.key`
  - `proposer.key`
  - `challenger.key`
  - `jwtsecret`

## Rotation

- Keys are rotated via Vault and re-rendered to `L2_SECRETS_DIR`.
- After rotation, restart:
  - `op-sequencer`
  - `op-batcher`
  - `op-proposer`
  - `op-challenger`

## Validation

- `infra/scripts/env-sync-l2.sh` validates env integrity and secrets mode.
- `infra/scripts/doctor-l2.sh` verifies secrets availability and RPC/metrics health.

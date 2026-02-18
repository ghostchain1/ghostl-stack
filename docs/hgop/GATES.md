# HGOP Gates

HGOP gates are designed to prevent automated changes in production environments.

## Environments

- `devnet`: local/dev
- `testnet`: staging
- `mainnet`: production

HGOP derives env from `HG_ENV` (preferred) or `NET_ENV`.

## Gate Variables

- `HGOP_EXEC_ENABLED` (default `0`)
  - Enables execution endpoints in devnet/testnet (mainnet still blocked).
- `HGOP_APPROVAL_TOKEN` (optional)
  - Required for gated mutating endpoints on testnet/mainnet.
- `HG_ATTESTOR_PRIVATE_KEY` (optional)
  - Required for `/proposals/:id/attest` (dev/test only).

## Approval Header

For gated endpoints:

- `x-hgop-approval-token: <token>`

## Behavior Matrix

| Action | Devnet | Testnet | Mainnet |
|---|---:|---:|---:|
| Read endpoints (`GET /health`, `GET /status`, `GET /incidents`, `GET /proposals`) | allowed | allowed | allowed |
| Mutating endpoints (`POST /incidents`, evidence, proposal generate, submit-governance) | allowed | token required | token required |
| Attest (`POST /proposals/:id/attest`) | allowed | token required | blocked |
| Execute (`POST /execute/...`) | requires `HGOP_EXEC_ENABLED=1` | requires `HGOP_EXEC_ENABLED=1` + token | blocked (403) |

Note: HGOP v1 executor is non-destructive by default (records `blocked` executions unless an explicit executor plugin is added).


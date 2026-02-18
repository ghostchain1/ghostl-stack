# HGOP Security Notes

## Mainnet Proposal-Only

HGOP enforces `MAINNET_PROPOSAL_ONLY` for execution endpoints.

- `/execute/*` returns `403 MAINNET_PROPOSAL_ONLY` when `HG_ENV=mainnet`

## No Docker Socket Requirement

HGOP does not require mounting `/var/run/docker.sock`. It only probes via:

- JSON-RPC (L1/L2/L3)
- Optional HTTP URLs (`HG_PROBE_URLS`)

## Artifact Path Safety

The artifacts download endpoint normalizes paths and blocks traversal:

- Requests are constrained to the proposal CMF directory.

## Approval Tokens

On testnet and mainnet, mutating endpoints require a configured approval token and a matching request header.

This is a lightweight guardrail; production deployments should additionally enforce:

- network-level ACLs
- session auth + RBAC
- audit logging


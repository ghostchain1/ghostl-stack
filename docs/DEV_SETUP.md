# Dev Setup

This repo expects:

- Ubuntu (recommended) or a Linux environment with `docker`, `docker compose`, and `sudo`
- Node.js `>=22.21.0 <23` (see `scripts/node-check.mjs`)
- Foundry (`forge`, `cast`, `anvil`) for contracts testing

## Bootstrap (Ubuntu 24.04)

From the repo root:

```bash
bash scripts/bootstrap-ubuntu.sh
```

## Install JS deps

```bash
npm ci
```

## Bring up the dev stack

This starts OP-stack infra via Docker Compose and runs the API + web via PM2:

```bash
bash dev-stack.sh
```

Notes:

- `dev-stack.sh` will create `apps/api/.env.local` and `apps/web/.env.local` from the `*.example` files if missing.
- If `node_modules` (including PM2) is missing, `dev-stack.sh` will run `npm ci`.

## Liquidity Gravity Engine (LGE)

Start the LGE stack:

```bash
bash scripts/up-liquidity-gravity.sh
```

Then follow the operator runbook in `docs/RUNBOOK.md`.


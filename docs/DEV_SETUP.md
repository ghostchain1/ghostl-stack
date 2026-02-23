# Dev Setup

This repo expects:

- Ubuntu (recommended) or a Linux environment with `docker`, `docker compose`, and `sudo`
- Git LFS (`git-lfs`) for large tracked artifacts
- Node.js `>=22.21.0 <23` (see `scripts/node-check.mjs`)
- Foundry (`forge`, `cast`, `anvil`) for contracts testing

## Bootstrap (Ubuntu 24.04)

From the repo root:

```bash
bash scripts/bootstrap-ubuntu.sh
```

## Git LFS

If you cloned without LFS, install and fetch LFS objects:

```bash
git lfs install
git lfs pull
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
- If Docker commands fail with `permission denied`, add your user to the `docker` group and re-login:
  - `sudo usermod -aG docker $USER`
- Next.js may emit a warning about SWC optional dependencies; it is safe to ignore if `npm run build` succeeds.

## Production app runtimes (root commands)

Required for API startup:

```bash
export GHOSTWALLET_MASTER_KEY=<32-byte-hex-or-base64>
```

Start individually:

```bash
npm run start:api:prod
npm run start:worker:prod
PORT=3200 npm run start -w apps/web
```

Start combined:

```bash
# API + Worker
npm run start:apps:prod

# API + Worker + Web
# Optional overrides: API_PORT, WEB_PORT, WORKER_HEALTH_PORT
npm run start:stack:prod
```

Quick verification:

```bash
npm run smoke:stack:prod
npm run verify:prod
```

## Liquidity Gravity Engine (LGE)

Start the LGE stack:

```bash
bash scripts/up-liquidity-gravity.sh
```

Then follow the operator runbook in `docs/RUNBOOK.md`.

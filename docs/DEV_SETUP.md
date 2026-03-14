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

This starts OP-stack infra via Docker Compose and runs the API + web as local background processes:

```bash
bash dev-stack.sh
```

Notes:

- `dev-stack.sh` will create `apps/api/.env.local` and `apps/web/.env.local` from the `*.example` files if missing.
- `dev-stack.sh` always runs `npm ci --prefer-offline` before starting local processes.
- Runtime logs/pids are written under `.tmp/dev-stack/` (`api.log`, `web.log`, `api.pid`, `web.pid`).
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

---

## GhostChain SDK (`@ghostchain/sdk`)

The SDK is a private package inside the monorepo (`packages/ghost-sdk/`). Node.js `>=22.21.0 <23` is required (matches root engine constraint).

### Build the SDK

```bash
# From repo root (builds only the SDK):
pnpm build -F @ghostchain/sdk

# Or directly:
cd packages/ghost-sdk && npx tsc -p tsconfig.json
```

### Type-check without emit

```bash
npx tsc -p packages/ghost-sdk/tsconfig.json --noEmit
```

### Import sub-paths (within monorepo)

Because the package is `"private": true`, add a workspace dependency in your app:

```json
// apps/api/package.json
{
  "dependencies": {
    "@ghostchain/sdk": "workspace:*"
  }
}
```

Then import using sub-paths:

```ts
import { createGhostL1RpcClient } from '@ghostchain/sdk/rpc';
import { GhostGasTracker } from '@ghostchain/sdk/gas';
import { GhostERC20 } from '@ghostchain/sdk/token/erc20';
```

Full API reference: [`packages/ghost-sdk/README.md`](../packages/ghost-sdk/README.md)

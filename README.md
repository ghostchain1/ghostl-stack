# ghostl-stack (Codespaces)

Brings up:
- L1: Anvil (31337) on :8545
- GhostL2: Polygon Edge (7192) on :9545
- GhostL3: Polygon Edge (7393) on :10545
- Ghost Guard API on :7070
- Ghost Relayer API on :7171
- Prometheus on :9090
- Grafana on :3000 (admin/admin)

## OP Stack L3-on-L2 Testnet Checklist

Use the battle-tested deployment checklist (with preflight script) for GhostLayer3 → GhostLayer2 → GhostLayer1:
- `docs/opstack-l3-testnet-deployment-checklist.md`

## Start
```bash
bash infra/scripts/up.sh
```

## Start (PolyBFT L2 anchored on L1)

```bash
bash infra/scripts/up_polybft.sh
```

## Production-style health check

```bash
bash infra/scripts/doctor.sh
```

## Create service keys (Guard/Relayer/Proposers)

This generates fresh private keys (saved only into ignored `.env` files), funds the addresses on L1/L2/L3 from the default dev account, and restarts services:

```bash
bash infra/scripts/keys/init.sh
```

## Optimistic Rollup (L2→L1, L3→L2)

During `bash infra/scripts/up.sh`, the deploy step generates:
- `services/ghost-rollup-proposer/.env.l2` (posts L2 batches to L1)
- `services/ghost-rollup-proposer/.env.l3` (posts L3 batches to L2)

This matches the dev architecture:
- **L2 is “settled” on L1** via `OptimisticRollup` on Anvil
- **L3 is “settled” on L2** via `OptimisticRollup` on GhostL2

Set `PROPOSER_PRIVATE_KEY` in those env files to enable batch posting + finalization.
Challengers are also generated:
- `services/ghost-rollup-challenger/.env.l2` and `.env.l3` (optional)

## Ops UI

- Ghost Guard UI: `http://localhost:7070/`
- Relayer UI proxy: `http://localhost:7070/proxy/relayer-health`
- Grafana: `http://localhost:3000/` (Prometheus is auto-provisioned)
- Command dashboard: `cd dashboard && npm start` (devcontainer preloads `SAFE_CONTRACTS`, override with `SAFE_CONTRACTS=0xabc:Ops Safe,...` for real multisigs)

## Chains

Polygon Edge chain data lives under `chains/` and is initialized automatically by `infra/scripts/up.sh`.
For a more production-like setup, use PolyBFT on L2 via `infra/scripts/up_polybft.sh`.

### Premine a funded key (enforcement)

If you want Ghost Guard / Relayer to send transactions, premine a wallet in `chains/l2/chain.json` (and optionally `chains/l3/chain.json`), then reset:

```bash
cd contracts
node -e "const {Wallet}=require('ethers'); const w=Wallet.createRandom(); console.log('ADDRESS=',w.address); console.log('PRIVATE_KEY=',w.privateKey);"
cd ..
bash infra/scripts/chains/premine.sh 0xYourAddress --l3
bash infra/scripts/reset.sh
bash infra/scripts/up.sh
```

## Demo (emit a deposit event)

```bash
bash infra/scripts/demo-deposit.sh
```

## Demo (finalize last deposit)

```bash
bash infra/scripts/demo-finalize.sh
```

## Demo (relay to L3)

```bash
cd .devcontainer
RELAYER_PRIVATE_KEY=0xac0974... docker compose up -d --force-recreate ghost-relayer
cd ..
bash infra/scripts/demo-relay.sh
```

## Demo (ERC20 bridge)

```bash
bash infra/scripts/demo-relay-erc20.sh
```

## Demo (optimistic L2->L1 -> L2 finalize -> L3 mint)

```bash
bash infra/scripts/demo-optimistic-erc20.sh
```

## Demo (ERC20 withdraw back to L2)

```bash
bash infra/scripts/demo-withdraw-erc20.sh
```

Notes:
- `ghost-relayer` uses `RELAYER_PRIVATE_KEY` for L3 mints; for L2 releases it uses `L2_RELAYER_PRIVATE_KEY` if set, otherwise falls back to `RELAYER_PRIVATE_KEY`.

## Relayer health

```bash
curl -sS http://localhost:7171/health
```

## Enable enforcement (optional)

By default Ghost Guard runs in observe-only mode (no `PRIVATE_KEY`).

```bash
cd .devcontainer
PRIVATE_KEY=... docker compose up -d --force-recreate ghost-guard
```

## Policy controls (requires enforcement)

If `ADMIN_TOKEN` is set (recommended), add `-H 'x-admin-token: ...'` to write requests.

```bash
# allow / delay / pause
curl -sS -X POST http://localhost:7070/policy/mode -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"mode":0}'

# adjust risk threshold (0..100) to unblock high-risk deposits during demos
curl -sS -X POST http://localhost:7070/policy/threshold -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"threshold":100}'

# optional: set a fixed delay (seconds) before finalize
curl -sS -X POST http://localhost:7070/policy/delay -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"seconds":30}'
```

## Allowlist / blocklist (optional)

Set `ADMIN_TOKEN` when starting `ghost-guard` to protect all write endpoints (`/policy/*` and `/lists/*`), then:

```bash
curl -sS http://localhost:7070/lists
curl -sS -X POST http://localhost:7070/lists/allow -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"address":"0x..."}'
curl -sS -X POST http://localhost:7070/lists/block -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"address":"0x..."}'
curl -sS -X POST http://localhost:7070/lists/remove -H 'content-type: application/json' -H 'x-admin-token: ...' -d '{"address":"0x..."}'
```

Lists are stored in a docker volume mounted at `/state` in the `ghost-guard` container.

If you really want to run without auth locally, set `ALLOW_INSECURE_ADMIN=1` for `ghost-guard`.

## Restart safety

Both `ghost-guard` and `ghost-relayer` persist a block cursor in `/state/cursor.json` so they can resume after restarts.

## Dev prerequisites

- `docker` + Docker Compose
- Node.js + npm
- `git-lfs` (repo has an LFS `pre-push` hook; Codespaces installs it via devcontainer feature)
  - If you hit the hook error locally: `bash infra/scripts/git_lfs_fix.sh`
- Polygonscan verification (Polygon / Amoy):
  - Set `POLYGONSCAN_API_KEY`, `POLYGON_RPC_URL` (mainnet) and/or `POLYGON_AMOY_RPC_URL`, plus `DEPLOYER_PRIVATE_KEY`.
  - Example (mainnet): `cd contracts && POLYGONSCAN_API_KEY=... POLYGON_RPC_URL=... DEPLOYER_PRIVATE_KEY=... npx hardhat verify --network polygon 0xYourDeployedAddress`

## Codespaces rebuild notes

- Devcontainer pins Polygon Edge to `0xpolygon/polygon-edge:1.3.2` (latest tags can break chain data and health checks).
- Git LFS is installed via a devcontainer feature; `infra/scripts/git_lfs_fix.sh` now supports both `apt` and `apk` if you run locally outside Codespaces.

## Config files

- `services/ghost-guard/.env` is generated by `contracts/scripts/deploy_all.ts` during `bash infra/scripts/up.sh`.
- Use `services/ghost-guard/.env.example` as a template if you want to run Ghost Guard without running the deploy step.

## Reset

```bash
bash infra/scripts/reset.sh
```

## Notes

* Contracts deploy to GhostL2.
* services/ghost-guard reads bridge events and can pause via GuardPolicy (requires PRIVATE_KEY).

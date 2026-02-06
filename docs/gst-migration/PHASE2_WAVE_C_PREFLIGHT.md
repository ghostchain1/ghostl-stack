# Phase 2 Wave C Preflight (Services Config / Env Keys)

Captured at (UTC): `2026-02-06T10:33:00Z`
Branch: `brand/gst-native`
Base revision (pre-commit): `95a5049e746c4a90428d7dde081aa3a3a3d5195f`

Wave C removes ETH-branded **configuration knobs** from first-party services while keeping legacy aliases for backward compatibility.

## Changes in scope

- `ghost-rpc-proxy`: rename `RPC_DEPRECATE_ETH_NAMESPACE` / `RPC_REJECT_ETH_NAMESPACE` to `RPC_DEPRECATE_LEGACY_NAMESPACE` / `RPC_REJECT_LEGACY_NAMESPACE` (legacy env vars still honored).
- `ghost-pil`: allow `PIL_RPC_NAMESPACE=evm|ghost` (legacy `eth` value accepted as alias).
- `ghost-gas-engine`: allow `GHOST_RPC_NAMESPACE=auto|evm|ghost` (legacy `eth` value accepted as alias; normalized internally).
- `ghost-registry`: report `rpcStandard: "evm"` instead of `"ethereum"`.

## Validation commands

```bash
node --check services/ghost-rpc-proxy/index.mjs
npm --prefix services/ghost-registry run build
npm --prefix services/ghost-pil run build
npm --prefix services/ghost-gas-engine run build
```

## Next steps

- Update `.eth` defaults (e.g., Snapshot space default) and rename `infra/ghostchain/docker-compose.eth.yml` to a GST-neutral name, updating first-party runbooks/scripts.
- Add Phase 3 enforcement (`scripts/gst-leakage-gate.sh`) with a tiny allowlist for technical/generated artifacts.

# Environment Promotion Runbook

Promotion order is strict:

1. `devnet`
2. `testnet`
3. `mainnet`

## Commands

- Devnet: `bash tools/ghostctl up devnet`
- Testnet: `bash tools/ghostctl up testnet`
- Mainnet: `bash tools/ghostctl up mainnet --proposal-id <id>`

## Enforcement

- `tools/ghostctl` writes promotion evidence in `.ghostctl/state/*.ok`.
- `testnet` is blocked until `devnet.ok` exists.
- `mainnet` is blocked until `devnet.ok` and `testnet.ok` exist.
- `mainnet` additionally requires governance approval validation.

## Rollback

- Stop stack: `bash tools/ghostctl down`
- Review health: `bash tools/ghostctl doctor`
- Re-run preflight before any re-promotion attempt.

# GhostStack Testnet Release Checklist

## 1) Preflight
- Run `scripts/testnet/00-preflight.sh`
- Verify compose resolves and routing-law checks pass
- Verify no secret scanner failures

## 2) Build
- Run `scripts/testnet/10-build.sh`
- Verify Docker builds and `apps/web` production build complete
- Verify `forge test -q` exits 0

## 3) Bring-up
- Run `scripts/testnet/20-up.sh`
- Verify all core RPC endpoints return `eth_chainId`
- Verify `docker compose ps` has no restart loops

## 4) Verification
- Run `scripts/testnet/30-verify.sh`
- Provide and archive:
  - `L3_TX_HASH`
  - `L2_INCLUSION_TX_HASH`
  - `L1_SETTLEMENT_TX_HASH`
  - `MESSENGER_ROUNDTRIP_PROOF`
- Verify `artifacts/routing_verification.json` and `artifacts/testnet/tx-proof-bundle.json`

## 5) Backup
- Run `scripts/testnet/40-backup.sh`
- Verify backup tarball exists in `artifacts/testnet/`

## 6) Rollback Drill
- Run `scripts/testnet/90-rollback.sh`
- Confirm services are stopped and rollback extract path is usable

## Go/No-Go
- GO only if all six sections pass
- Any failure => NO-GO with remediation ticket

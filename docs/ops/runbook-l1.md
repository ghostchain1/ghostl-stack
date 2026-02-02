# L1 Operations Runbook

## Quick checks

```bash
# L1 health
grep -n "FAIL" /var/log/ghostchain/l1.log || true
infra/scripts/doctor-l1.sh
```

## Core endpoints

- RPC: `HOST_L1_RPC`
- WS: `HOST_L1_WS`
- Metrics: `L1_METRICS_PROM_URL`

## Standard start/stop

```bash
# Start
infra/ghostchain/scripts/up.sh

# Stop
infra/ghostchain/scripts/down.sh
```

## Common issues

### RPC unreachable
- Confirm container status: `docker compose -f infra/ghostchain/docker-compose.eth.yml ps`
- Check bind ports: `ss -lnt | rg 18545`
- Validate chain ID: `curl -fsS http://localhost:18545 -H content-type:application/json -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'`

### Metrics missing
- Confirm metrics endpoint: `curl -fsS http://localhost:18660/debug/metrics/prometheus | head -n 5`
- Verify Prometheus targets.

### Vault secrets not found
- Verify Vault env vars set: `VAULT_ADDR`, `VAULT_TOKEN` or `VAULT_ROLE_ID`/`VAULT_SECRET_ID`.
- Validate `L1_SECRETS_DIR` contains the required keys.

## Routine tasks

- Rotate validator keys only via the approved key-rotation playbook.
- Re-run `infra/scripts/doctor-l1.sh` after any config change.

## Evidence pack (latest)

- Timestamp: `20260202T154243Z`
- SHA256: `ec870e6eb031ce8be0bcccfab284b5216f90b6a3f6f117c5f7e2a4d484fd83e8`
- Artifact: `infra/evidence/out/evidence-pack-l1-20260202T154243Z.zip`

```bash
sha256sum -c infra/evidence/out/evidence-pack-l1-20260202T154243Z.zip.sha256
```

## Post go/no-go cleanup

- Archive the evidence pack to long-term storage.
- Prune older `infra/evidence/out` bundles after confirming backups.

## Submodule PRs

```
op-geth: https://github.com/ghostchain1/op-geth/pull/1
optimism: https://github.com/ghostchain1/optimism/pull/1
```

## Go/No-Go gate

```bash
# Final release gate checks
infra/scripts/gates/l1-go-no-go.sh
```

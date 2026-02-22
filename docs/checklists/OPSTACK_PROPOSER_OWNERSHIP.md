# OP Stack Proposer Ownership Checklist

Use this checklist to prevent duplicate proposer ownership and keep the L2 proposer path stable.

## Default policy

- Keep `infra/opstack/docker-compose.yml` service `op-proposer` disabled by default (`profiles: [disabled]`).
- Treat `services-ghost-rollup-proposer-1` as the authoritative L2 proposer runtime.
- Do not run both proposer stacks at the same time.

## Preflight before any proposer change

- Confirm only one proposer container is active:
  - `docker ps --format '{{.Names}}|{{.Status}}' | grep -E 'services-ghost-rollup-proposer-1|opstack-op-proposer-1' || true`
- Verify no proposer port conflicts are introduced by compose changes.
- Validate dispute game / proposer compatibility for the target environment before enabling `op-proposer`.

## If you intentionally enable `op-proposer`

- Enable it explicitly with the disabled profile flow (do not make it a default startup dependency).
- Keep polling conservative unless testing requires otherwise:
  - `OP_PROPOSER_POLL_INTERVAL=10m` (or slower in noisy environments).
- Ensure `--game-type` and game factory wiring match deployed contracts.
- Keep `op-gate` in-path for proposer submissions where guard policy is expected.

## Post-change verification

- Confirm only one proposer is proposing/finalizing output roots.
- Check recent logs for root-claim load failures and `NoImplementation(uint32)`-style reverts.
- Revert to default policy (single authoritative proposer) if any compatibility errors recur.

## Rollback to safe default

Use this sequence to quickly return to the single authoritative proposer model:

```bash
# 1) Ensure infra/opstack op-proposer stays non-default
docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets \
  -f infra/opstack/docker-compose.yml --profile disabled stop op-proposer || true

# 2) Remove any lingering duplicate container
docker rm -f opstack-op-proposer-1 || true

# 3) Verify only services proposer is present
docker ps --format '{{.Names}}|{{.Status}}' \
  | grep -E 'services-ghost-rollup-proposer-1|opstack-op-proposer-1' || true
```

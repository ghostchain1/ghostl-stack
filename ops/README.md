# Ops Directory Guide

This folder contains operational artifacts, verification scripts, and snapshots for the GhostChain stack.

## Key entries

- `STACK_PLAN.md`: sequential, non-destructive ops plan.
- `STACK_CANONICAL.yml`: canonical stack map used by `ops/scripts/verify.sh`.
- `scripts/`: preflight, snapshot, rollback, verify, and blueprint tooling.
- `snapshots/`: captured configuration snapshots for rollback and auditing.

## Runbooks

Operational runbooks live in `docs/ops/` (see `docs/ops/README.md`).

## L1 release integration

Use the L1 release/rollback scripts in `infra/scripts/` for production gates:

```bash
infra/scripts/release-l1.sh --mode=staging --tag=l1-<version>
infra/scripts/rollback-l1.sh --mode=staging --tag=l1-<previous>
```

## Preflight integrations

`ops/scripts/preflight.sh` can optionally run L1 health checks and emit an evidence pack:

```bash
ops/scripts/preflight.sh --l1-doctor --emit-l1-evidence
```

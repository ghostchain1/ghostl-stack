# GhostStack Testnet Audit (2026-02-26)

## Status
- Verdict: **NOT READY (NO-GO)**

## Critical Findings
1. Plaintext secrets committed across repository (`.env`, `services/*/.env`)
2. Compose path collisions and profile-based omissions block deterministic preflight (`op-proposer` disabled profile; overlapping services between autonomy and L3 compose)
3. Routing-law proof not complete at runtime (no tx proof bundle supplied)

## High Findings
1. Host namespace escalation compose exists (`infra/opstack/docker-compose.network-manager.yml` uses `network_mode: host` + `pid: host`)
2. L1 node launch script uses insecure unlock flag (`infra/ghostchain/geth/run-node.sh`)
3. Admin RPC enabled on OP nodes (`infra/opstack/docker-compose.yml`)

## Medium Findings
1. Missing healthchecks in multiple compose files (`.audit/evidence/compose-healthcheck-summary.txt`)
2. Hardening gaps: widespread lack of explicit `read_only` and user pinning (`.audit/evidence/compose-hardening-baseline.json`)

## Added Artifacts
- Testnet compose override: `compose.testnet.yml`
- Env templates: `.env.l1.testnet.example`, `.env.l2.testnet.example`, `.env.l3.testnet.example`, `.env.ui.testnet.example`
- Testnet scripts: `scripts/testnet/00-preflight.sh` .. `90-rollback.sh`
- Policies and runbooks under `docs/testnet/` and `ops/`

## Immediate Remediation
1. Remove committed secrets and rotate all testnet credentials
2. Resolve compose collisions for full autonomy + L3 merge
3. Enable/verify proposer path for L2 settlement workflow in release profile
4. Produce mandatory proof bundle for L3->L2->L1 and messenger roundtrip

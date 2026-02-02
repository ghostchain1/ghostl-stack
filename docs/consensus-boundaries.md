# Consensus Boundaries (Repo vs External Clients)

## Source-of-truth execution/consensus clients (external to this repo)
- L1: `geth` clique PoA devnet (bootnode + signers). Consensus, fork choice, P2P, and state transition live in geth.
- L2/L3: OP Stack (`op-geth` + `op-node`). Derivation, fork choice, and P2P live in the OP clients.
- Challengers and fault proofs: run via OP Stack binaries and config; not implemented in this repo.

## Repo-owned control plane and configuration
- Docker compose definitions, env files, and orchestration scripts under `infra/`, root `docker-compose*.yml`, and `services/*/docker-compose.yml`.
- On-chain governance and protocol contracts (governor, executor, staking, slashing, treasury, token) under `contracts/src/`.
- Guard/AI/telemetry/relayer services under `services/` and `core-service/`.
- Monitoring stack (Prometheus/Grafana) under `infra/opstack` and `observability/`.

## Boundary rules
- This repo does not embed or replace consensus/P2P/state-transition logic.
- Any automation must interact via standard client APIs (JSON-RPC/Engine/OP tooling) and must not modify client internals.
- The legacy PolyBFT path is retired (`infra/scripts/chains/init_polybft_l2.sh` exits with a deprecation message).

## Change control surface
- Governance lives on L1 (contracts under `contracts/src/governance`) and is the control plane for upgrades and critical actions.
- Local dev keys live in env files (`infra/opstack/.env`, `.env.secrets`); production guidance points to Vault/KMS in `docs/SECRETS.md` and checklists.

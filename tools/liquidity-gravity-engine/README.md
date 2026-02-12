# Liquidity Gravity Engine (LGE)

This folder is a thin “project anchor” for the Liquidity Gravity Engine implementation.

Implementation lives in:

- On-chain contracts: `contracts/src/liquidity/`
- Router + relayer (off-chain): `services/liquidity-router/`
- Operator CLI: `tools/liquidityctl/`
- Dev stack compose: `infra/docker/liquidity-gravity/docker-compose.yml`
- Docs: `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/INVARIANTS.md`, `docs/RUNBOOK.md`

Configuration is centralized in `services/stack.env`.


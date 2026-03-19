# Compose Bundles Validation Report

- Generated (UTC): 2026-03-19 13:51:56Z
- Scope: top-level and major bundle compose validations with required base files for override-only compose files
- Command: `docker compose -f <file> [...] config`

## Summary

- Total checks: **18**
- Passed: **18**
- Failed: **0**

## Passed

- **docker-compose.yml**
  - Files: `docker-compose.yml`
- **docker-compose.dev.yml** _(warnings emitted)_
  - Files: `docker-compose.dev.yml`
- **docker-compose.econ.devnet.yml**
  - Files: `docker-compose.econ.devnet.yml`
- **docker-compose.econ.testnet.yml**
  - Files: `docker-compose.econ.testnet.yml`
- **docker-compose.econ.mainnet.yml**
  - Files: `docker-compose.econ.mainnet.yml`
- **docker-compose.autonomy.yml**
  - Files: `docker-compose.autonomy.yml`
- **docker-compose.phase3.yml**
  - Files: `docker-compose.phase3.yml`
- **docker-compose.ai-consensus.yml**
  - Files: `docker-compose.ai-consensus.yml`
- **docker-compose.agents.yml**
  - Files: `docker-compose.agents.yml`
- **docker-compose.cascading-finality.yml**
  - Files: `docker-compose.cascading-finality.yml`
- **docker-compose.phase3.secrets.yml (with phase3 base)**
  - Files: `docker-compose.phase3.yml`, `docker-compose.phase3.secrets.yml`
- **apps/docker-compose.yml**
  - Files: `apps/docker-compose.yml`
- **apps/docker-compose.dev.yml** _(warnings emitted)_
  - Files: `apps/docker-compose.dev.yml`
- **infra/opstack/docker-compose.yml** _(warnings emitted)_
  - Files: `infra/opstack/docker-compose.yml`
- **infra/opstack/docker-compose.l3.yml (with opstack base)** _(warnings emitted)_
  - Files: `infra/opstack/docker-compose.yml`, `infra/opstack/docker-compose.l3.yml`
- **infra/opstack/docker-compose.network-manager.yml**
  - Files: `infra/opstack/docker-compose.network-manager.yml`
- **infra/opstack/docker-compose.challengers.yml (with opstack+l3 bases)** _(warnings emitted)_
  - Files: `infra/opstack/docker-compose.yml`, `infra/opstack/docker-compose.l3.yml`, `infra/opstack/docker-compose.challengers.yml`
- **ghostvm-ai release checklist json smoke**
  - Files: `services/ghostvm-ai/scripts/release_checklist.sh`
  - Result: json_contract_ok


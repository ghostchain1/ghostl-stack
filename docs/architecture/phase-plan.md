# GhostChain Global Compliance Phase Plan

Defaults:
- `PIL_ENABLED=false`
- `PIL_AUTONOMY_MODE=ADVISORY`
- `PIL_WRITE_ENABLED=false`
- `PIL_APPROVAL_REQUIRED=true`
- `PIL_SIM_ENABLED=false`

## Phase 1 - Data Plane (Observation)
- Compliance registry: chains, jurisdictions, policy packs.
- Legal signals ingestion (adapters are pluggable, local JSON by default).
- Metrics + dashboards for visibility only.
- No enforcement, no chain writes.

## Phase 2 - Digital Twin (Simulation)
- Replay last N blocks to simulate candidate policy packs.
- Generate simulation reports: false positive rates, validator load, tx impact.
- No enforcement, no chain writes.

## Phase 3 - Autonomy (Enforcement)
- Policy-as-code enforcement at RPC preflight (ALLOW/WARN/BLOCK).
- Application gating using policy decisions and proofs.
- Autonomous policy generation + activation when thresholds are met.
- Feature flags: autonomy=off|advisory|active|full.

## Phase 4 - Governance (Control)
- Emergency mode and rollback snapshots.
- Multi-sig override workflows.
- Validator compliance economics integration (reward multipliers + soft slashing).

## Deploy commands
- Phase 1:
  - `docker compose -f services/pil-postgres/docker-compose.yml up -d`
  - `docker compose -f services/pil-migrate/docker-compose.yml up -d`
  - `docker compose -f services/ghost-pil/docker-compose.yml up -d`
  - `docker compose -f services/ghost-pil-worker/docker-compose.yml up -d`
- Phase 2: enable simulation worker (future: `PIL_SIM_ENABLED=true`)
- Phase 3: `PIL_ENABLED=true`, `PIL_WRITE_ENABLED=true`, `PIL_AUTONOMY_MODE=ASSISTED`
- Phase 4: `PIL_AUTONOMY_MODE=AUTONOMOUS_STRICT`, governance approvals enabled

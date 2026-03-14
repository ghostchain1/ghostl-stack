# Locked Execution Plan

Default flags:
- `PIL_ENABLED=false`
- `PIL_AUTONOMY_MODE=ADVISORY`
- `PIL_WRITE_ENABLED=false`
- `PIL_APPROVAL_REQUIRED=true`
- `PIL_SIM_ENABLED=false`

## Phase 1 - Data Plane (Observe)
Artifacts:
- DB schema + migrations (`services/ghost-pil/src/db/migrations`)
- REST APIs (`/health`, `/v1/chains`, `/v1/jurisdictions`, `/v1/legal-signals`, `/v1/policy-packs`, `/v1/attestations`)
- Metrics `/metrics`
- Read-only dashboards (`/protocol/*`)

Deploy:
```
docker compose -f services/pil-postgres/docker-compose.yml up -d
docker compose -f services/pil-migrate/docker-compose.yml up -d
docker compose -f services/ghost-pil/docker-compose.yml up -d
docker compose -f services/ghost-pil-worker/docker-compose.yml up -d
```

Rollback:
```
docker compose -f services/ghost-pil/docker-compose.yml stop
docker compose -f services/ghost-pil-worker/docker-compose.yml stop
```

Smoke tests:
```
./scripts/pil/smoke-phase1.sh
```

Success criteria:
- `/health` returns ok
- `/v1/chains` returns L1/L2/L3
- UI renders Protocol Intelligence pages

## Phase 2 - Digital Twin (Simulate)
Artifacts:
- Simulation engine + reports
- `POST /v1/simulations` and report endpoints

Deploy:
```
export PIL_SIM_ENABLED=true
```

Rollback:
```
export PIL_SIM_ENABLED=false
```

Smoke tests:
```
./scripts/pil/smoke-phase2.sh
```

Success criteria:
- Simulation reports generated without chain writes

## Phase 3 - Autonomy (Enforce)
Artifacts:
- Policy engine + enforcement adapters
- RPC preflight gating
- Explainability graphs

Deploy:
```
export PIL_ENABLED=true
export PIL_WRITE_ENABLED=true
export PIL_AUTONOMY_MODE=ASSISTED
```

Rollback:
```
export PIL_AUTONOMY_MODE=ADVISORY
export PIL_WRITE_ENABLED=false
```

Smoke tests:
```
./scripts/pil/smoke-phase3.sh
```

Success criteria:
- Preflight returns WARN/BLOCK for high-risk cases
- No unapproved chain writes

## Phase 4 - Governance (Control)
Artifacts:
- Emergency mode + rollback snapshots
- Validator compliance economics integration
- Multisig override workflow

Deploy:
```
export PIL_AUTONOMY_MODE=AUTONOMOUS_STRICT
```

Rollback:
```
export PIL_AUTONOMY_MODE=ASSISTED
```

Smoke tests:
```
./scripts/pil/smoke-phase4.sh
```

Success criteria:
- Governance approvals required for high-risk actions
- Rollback path available

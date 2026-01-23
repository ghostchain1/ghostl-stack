# Ghost Chain AI Core

Ghost-native AI core for GhostChain (L1), GhostL2, and GhostL3. Includes gas intelligence, chain observation, and policy-aware decisioning.

## Features
- Pre-flight gas simulation
- Policy-based gas recommendations
- Deployment retry queue with tracing and classification
- Autonomy decision loop with risk forecasts and policy drift tracking
- AI core observation → prediction → decision → action → learn loop
- Governance recommendations and safety interventions
- Prometheus metrics and structured logs

## Environment
Copy `.env.example` and adjust:

```
PORT=3210
DATABASE_URL=postgres://ghost:ghostpass@postgres:5432/ghost_gas
REDIS_URL=redis://redis:6379
CHAINS_CONFIG_PATH=/app/config/chains.json
POLICIES_PATH=/app/config/gas-policies.json
GHOST_RPC_NAMESPACE=auto
RPC_L1=http://host.docker.internal:18545
RPC_L2=http://host.docker.internal:18547
RPC_L3=http://host.docker.internal:39545
GAS_TOKEN_L1=GHOST
GAS_TOKEN_L2=GL2GAS
GAS_TOKEN_L3=GL3GAS
SIGNER_PRIVATE_KEY=
ADMIN_TOKEN=
SEED_SAMPLE_DATA=true
AUTONOMY_ENABLED=true
AUTONOMY_MODE=ASSISTED
AUTONOMY_MAX_RISK=0.65
AUTONOMY_MAX_GAS=30000000
AUTONOMY_MAX_RETRIES=5
AUTONOMY_POLICY_LOCK=false
AUTONOMY_POLICY_MAX_DELTA=0.08
AUTONOMY_FORECAST_INTERVAL_SECONDS=120
```

Autonomy modes: `OBSERVE_ONLY`, `ADVISORY`, `ASSISTED`, `AUTONOMOUS`, `AUTONOMOUS_STRICT`.

## Run locally

```
npm install
npm run migrate
npm run dev
```

## API

### Health
`GET /health`

### Chains
`GET /v1/chains`

### Policies
`GET /v1/policies`
`PUT /v1/policies/:chainId` (requires `x-admin-token` if `ADMIN_TOKEN` set)

### Simulate
```
POST /v1/simulate
{
  "chainKey": "l1",
  "txRequest": { "from": "0x...", "to": "0x...", "data": "0x" }
}
```

### Submit with retry
```
POST /v1/tx/submitWithRetry
{
  "chainKey": "l1",
  "name": "Deploy Token",
  "txRequest": {
    "from": "0x...",
    "data": "0x..."
  }
}
```

### Metrics
`GET /metrics`
`GET /v1/metrics/summary`

### Autonomy
`GET /v1/autonomy/status`
`GET /v1/autonomy/decisions`
`GET /v1/autonomy/events`
`GET /v1/autonomy/risk-forecasts`
`GET /v1/autonomy/policy-drift`
`GET /v1/autonomy/policy-history`
`GET /v1/autonomy/prevented-failures`

Admin-only (requires `x-admin-token`):
`POST /v1/autonomy/override`
`POST /v1/autonomy/decisions/:id/approve`
`POST /v1/autonomy/decisions/:id/replay`

### AI Core
`GET /v1/ai-core/status`
`GET /v1/ai-core/observations`
`GET /v1/ai-core/predictions`
`GET /v1/ai-core/decisions`
`GET /v1/ai-core/actions`
`GET /v1/ai-core/fingerprints`
`GET /v1/ai-core/suppression-rules`
`GET /v1/ai-core/playbooks`
`GET /v1/ai-core/governance`
`GET /v1/ai-core/policy-constraints`

Admin-only:
`POST /v1/ai-core/policy-constraints`
`POST /v1/ai-core/governance/:id/ack`

## Notes
- The worker consumes retry jobs via Redis and runs the AI core loop on interval.
- `SEED_SAMPLE_DATA=false` disables sample rows for production.

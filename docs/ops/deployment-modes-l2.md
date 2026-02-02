# L2 Deployment Modes

This document defines the required settings for local, staging, and production L2 (OP Stack) deployments.

## Common variables

- `L2_ENV`: `local` | `staging` | `production`
- `L2_SECRETS_SOURCE`: `dev` | `vault`
- `HOST_L1_RPC`: L1 RPC endpoint used by op-node/batcher/proposer
- `HOST_L2_RPC`: L2 execution RPC endpoint
- `AI_MONITOR_OBSERVE_ONLY`: `1` for observe-only, `0` for policy-gated actions
- `POLICY_REGISTRY_ADDRESS`: L1 `AgentGovernancePolicy` registry address

## Local dev

**Secrets source**
- `L2_SECRETS_SOURCE=dev`
- `ALLOW_DEV_SECRETS=1`

**Logging sink**
- Docker logs (local)

**Metrics**
- `OP_NODE_METRICS_URL=http://localhost:7300/metrics`
- `OP_BATCHER_METRICS_URL=http://localhost:7301/metrics`
- `OP_PROPOSER_METRICS_URL=http://localhost:7302/metrics`

**Rate limits**
- Guard in observe mode; permissive defaults.

**Scaling rules**
- Single instance per role.

## Staging

**Secrets source**
- `L2_SECRETS_SOURCE=vault`
- Vault Agent or AppRole required.

**Logging sink**
- Central log pipeline (Loki/ELK) with JSON logs enabled.

**Metrics**
- Prometheus scrapes op-node + batcher + proposer + ai-monitor.

**Rate limits**
- Guard delay/throttle enabled.
- AI actions policy-gated (L1 registry).

**Scaling rules**
- At least 2 instances for RPC proxy and op-node (active/standby).

## Production

**Secrets source**
- `L2_SECRETS_SOURCE=vault` (required)
- `ALLOW_DEV_SECRETS=0`

**Logging sink**
- Central log pipeline with retention policy.

**Metrics**
- Prometheus + Grafana; alert rules enabled.
- `AI_MONITOR_OBSERVE_ONLY=0` only if policy registry is configured.

**Rate limits**
- Guard delay/throttle enabled.
- CORS restricted to production UI domains.

**Scaling rules**
- Redundant op-node and RPC proxies.

## Verification

Run after each deploy (all modes):

```bash
infra/scripts/doctor-l2.sh
```

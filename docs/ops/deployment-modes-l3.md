# L3 Deployment Modes

This document defines the required settings for local, staging, and production L3 (OP Stack) deployments.

## Common variables

- `L3_ENV`: `local` | `staging` | `production`
- `L3_SECRETS_SOURCE`: `dev` | `vault`
- `PARENT_L2_RPC`: Parent L2 RPC endpoint used by L3 op-node/batcher/proposer
- `L3_RPC`: L3 execution RPC endpoint
- `AI_MONITOR_OBSERVE_ONLY`: `1` for observe-only, `0` for policy-gated actions
- `POLICY_REGISTRY_ADDRESS`: L2 `AgentGovernancePolicy` registry address

## Local dev

**Secrets source**
- `L3_SECRETS_SOURCE=dev`
- `ALLOW_DEV_SECRETS=1`

**Logging sink**
- Docker logs (local)

**Metrics**
- `L3_METRICS_NODE_HOST_PORT=8300`
- `L3_METRICS_BATCHER_HOST_PORT=8301`
- `L3_METRICS_PROPOSER_HOST_PORT=8302`
- `L3_GETH_METRICS_HOST_PORT=39606`

**Rate limits**
- Guard in observe mode; permissive defaults.

**Scaling rules**
- Single instance per role.

## Staging

**Secrets source**
- `L3_SECRETS_SOURCE=vault`
- Vault Agent or AppRole required.

**Logging sink**
- Central log pipeline (Loki/ELK) with JSON logs enabled.

**Metrics**
- Prometheus scrapes L3 services + ai-monitor-l3.

**Rate limits**
- Guard delay/throttle enabled.
- AI actions policy-gated (L2 registry).

**Scaling rules**
- At least 2 instances for L3 RPC proxy and op-node (active/standby).

## Production

**Secrets source**
- `L3_SECRETS_SOURCE=vault` (required)
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
bash infra/scripts/doctor-l3.sh
```

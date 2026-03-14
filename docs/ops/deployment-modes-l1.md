# L1 Deployment Modes

This document defines the required settings for local, staging, and production L1 deployments.

## Common variables

- `L1_MODE`: `local` | `staging` | `production`
- `L1_SECRETS_SOURCE`: `dev` | `vault`
- `HOST_L1_RPC`: RPC endpoint used by health checks
- `PROMETHEUS_URL`: Prometheus base URL
- `L1_METRICS_PROM_URL`: L1 metrics endpoint (Prometheus format)

## Local dev

**Secrets source**
- `L1_SECRETS_SOURCE=dev`
- `ALLOW_DEV_SECRETS=1`

**Logging sink**
- Docker logs (local)

**Metrics**
- `PROMETHEUS_URL=http://localhost:9090`
- `L1_METRICS_PROM_URL=http://localhost:18660/debug/metrics/prometheus`

**Rate limits**
- RPC: permissive defaults; keep `ghost-rpc-proxy` (if used) in observe-only mode.

**Scaling rules**
- Single node; no autoscaling.

## Staging

**Secrets source**
- `L1_SECRETS_SOURCE=vault`
- Vault Agent or AppRole required.

**Logging sink**
- Central log pipeline (Loki/ELK) with JSON logs enabled.

**Metrics**
- `PROMETHEUS_URL` points to staging Prometheus.
- `L1_METRICS_PROM_URL` exposed via internal load balancer or sidecar scrape.

**Rate limits**
- Enable RPC rate limiting via reverse proxy (baseline).
- CORS restricted to staging UI domains.

**Scaling rules**
- At least 2 nodes (validator + observer) for restart resilience.

## Production

**Secrets source**
- `L1_SECRETS_SOURCE=vault` (required)
- `ALLOW_DEV_SECRETS=0`

**Logging sink**
- Central log pipeline (Loki/ELK) with retention policy.

**Metrics**
- Prometheus + Grafana wired; alert rules enabled.
- `REQUIRE_PROM_TARGET=1` in `doctor-l1.sh` to ensure scrape target exists.

**Rate limits**
- Enforce RPC rate limits and auth on sensitive methods.
- CORS restricted to production UI domains.

**Scaling rules**
- Minimum 3 validators + 1 observer.
- Horizontal scaling for RPC and log ingestion.

## Verification

Run after each deploy (all modes):

```bash
bash infra/scripts/doctor-l1.sh
```

# L1 Playbook: Metrics Missing

## Detection signals
- Prometheus targets missing `ghostchain-l1` or `ghostchain-rpc-proxy`
- `doctor-l1.sh` warns metrics not reachable

## Immediate mitigation
1. Check metrics endpoint:
   - `curl -s http://localhost:18660/debug/metrics/prometheus`
2. Reload Prometheus:
   - `curl -X POST http://localhost:9090/-/reload`

## Permanent fix
- Ensure `observability/infra/prometheus.yml` contains the L1 scrape jobs.
- Verify `host.docker.internal` is resolvable from Prometheus.

## Verification
- `curl -s http://localhost:9090/api/v1/targets | rg ghostchain`

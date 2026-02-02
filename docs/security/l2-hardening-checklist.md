# Ghost L2 Hardening Checklist

## Container/runtime
- [x] Drop Linux capabilities (`cap_drop: ALL`).
- [x] Enable `no-new-privileges`.
- [x] Run services as non-root UID.
- [ ] Enable read-only root filesystem where possible.
- [ ] Add explicit seccomp/apparmor profiles for RPC/proxy services.

## Network & ingress
- [x] Isolate L2 services on dedicated Docker networks.
- [x] RPC proxy rate limits + optional auth (op-gate).
- [ ] Restrict L2 RPC/metrics to private networks in production.
- [ ] Enforce firewall rules on L2 RPC/WS ports.

## Secrets
- [x] Vault-backed secret rendering paths.
- [x] Secret files mounted read-only to containers.
- [ ] Rotate batcher/proposer/JWT secrets on schedule.

## L1 anchoring safety
- [x] L1 head lag detection (op-node + AI monitor).
- [x] Proposer/batcher idle alerts and gate checks.
- [ ] Run L1 RPC behind HA proxy in production.

## Data integrity
- [x] Genesis/config checksums validated by doctor script.
- [ ] Backup/restore workflows tested for L2 data dir.
- [ ] Snapshot retention policy defined.

## Observability
- [x] Prometheus scrapes L2 metrics, op-node, batcher/proposer.
- [x] Grafana dashboards for output latency and batcher/proposer health.
- [ ] Centralized log shipping with retention policy.

## Governance safety
- [x] L1 policy registry required for AI actions.
- [x] Tiered governance safety model documented.
- [ ] Multi-sig + timelock required for Tier 3 operations in prod.

# GhostChain L1 Hardening Checklist

## Container/runtime
- [x] Drop Linux capabilities (`cap_drop: ALL`).
- [x] Enable `no-new-privileges`.
- [x] Run services as non-root UID (1000).
- [ ] Enable read-only root filesystem where possible.
- [ ] Add explicit seccomp/apparmor profiles for RPC/proxy services.

## Network & ingress
- [x] Isolate L1 services on a dedicated Docker network.
- [x] RPC proxy rate limits + optional auth.
- [ ] Restrict RPC/metrics to private networks in production.
- [ ] Enforce firewall rules on 18545/18546/18551/18660.

## Secrets
- [x] Vault-backed secret rendering paths.
- [x] Secret files mounted read-only to containers.
- [ ] Rotate validator/JWT secrets on schedule.

## Data integrity
- [x] Genesis/config checksums validated by doctor script.
- [ ] Backup/restore workflows tested for data dir.
- [ ] Snapshot retention policy defined.

## Observability
- [x] Prometheus scrapes L1 metrics, RPC proxy, ai-monitor.
- [x] Grafana L1 dashboard for health/rpc/ai signals.
- [ ] Centralized log shipping with retention policy.

## Governance safety
- [x] Policy registry for AI actions.
- [x] Tiered governance safety model documented.
- [ ] Multi-sig + timelock required for Tier 3 operations in prod.

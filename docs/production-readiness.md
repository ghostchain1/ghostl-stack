# Production readiness checklist

Use this as a hardening playbook before promoting the stack beyond devnet.

## Configuration & secrets
- Store all env in a secrets manager (Vault/SSM/Secrets Manager); never bake keys into images or compose files.
- Define per-env presets: `staging`, `prod` (RPC URLs, chain IDs, confirmations, challenge windows, SAFE_CONTRACTS, admin tokens).
- Maintain sanitized `.env.example` files for every service; use `envsubst`/templating to render real env at deploy time.

## Identity, auth, RBAC
- Require OIDC on the dashboard; disable insecure flags (`ALLOW_INSECURE_ADMIN=0`).
- Enforce role checks on every write endpoint (guard/gate policy, restarts, key mgmt); audit all writes.
- Make SAFE_CONTRACTS point to real multisigs; keep signer lists in KMS/HSM, not local disk.

## Networking & TLS
- Put services behind an ingress/proxy with TLS termination; enforce mTLS or signed tokens between dashboard ↔ core-service ↔ guard/relayer.
- Restrict RPC/grafana/prometheus to private networks; add rate limiting/WAF at the edge.

## Data durability
- Persist guard/relayer cursors, chain data, and logs on durable volumes with backups/snapshots and retention policies.
- Encrypt at rest for volumes that hold keys or cursors.

## Chain safety
- Increase `CONFIRMATIONS` for relayer/proposers; set realistic `CHALLENGE_PERIOD_SECONDS`.
- Separate keys for relayer/proposer/challenger; keep in KMS/HSM with rotation and narrowly scoped allowances.
- Turn off auto-actions until monitored; require multi-sig approvals for production SAFE_CONTRACTS.

## Observability & alerts
- Standardize `/health` + `/ready` on every service; wire alerting for risk spikes, relayer lag, proposer errors, challenger mismatches, RPC lag/peers < threshold.
- Centralize logs (JSON) to ELK/Loki; add dashboards for guard decisions, rollup throughput, bridge pending/finalized, and SAFE activity.
- Track deploy/version labels in metrics to correlate incidents.

## Build & deploy
- Produce minimal, pinned container images (no latest tags); sign images; generate SBOMs; run vulnerability scans.
- CI gates: lint/test, typecheck, unit/integration where possible; fail on secrets in git history/commits.
- Release flow: build -> push -> deploy to staging -> smoke tests -> manual promote to prod with rollback hooks.

## Resilience & SLOs
- Set resource limits/requests; configure restarts/backoff; add pod disruption budgets if on K8s.
- Define SLOs for RPC latency, relayer finality lag, proposer throughput; alert on error budgets.

## Change management
- Migration scripts for config/chain data; explicit runbooks for rollbacks.
- Versioned dashboards and alerts checked into git; tag releases and keep a changelog.

# Production readiness checklist

Use this as a hardening playbook before promoting the stack beyond devnet.

## Automated configure + build + readiness gate

Use the orchestration script to run environment sync, OP Stack preflight, build, doctors, and go/no-go gates as one flow.

```bash
# Production (Vault-backed, fail-closed defaults)
npm run configure:build:ready

# Temporary OP-only fallback (keeps build/gates, temporarily disables RELAYER_REQUIRE_L2_FINALITY_ON_L1 when proposer health is unavailable)
npm run configure:build:ready:op-only

# Staging
npm run configure:build:staging

# Dev (dev secrets allowed)
npm run configure:build:dev
```

Direct script usage:

```bash
bash infra/scripts/production/configure-build-ready.sh --mode=production --secrets=vault
```

Useful flags:

- `--install-deps`: run `npm ci` (root + contracts) before checks.
- `--start-stack`: start stack with `infra/scripts/up-full.sh`.
- `--build-services`: build service images (`npm run build:services`).
- `--bridge-dry-runs`: run bridge E2E dry-runs after gates.
- `--skip-build`, `--skip-gates`, `--skip-ai-gate`: targeted skips for controlled troubleshooting.
- `--allow-dirty`: permit dirty git tree for AI gate (not recommended outside dev).
- `--allow-finality-fallback`: temporary production/staging fallback to proceed with `RELAYER_REQUIRE_L2_FINALITY_ON_L1=false` when rollup proposer health is unavailable.
- `--dry-run`: print planned commands only.

Vault credential discovery supports:

- `VAULT_ENV_FILE` (contains `VAULT_ADDR` plus token or AppRole values)
- `VAULT_TOKEN_FILE` (token first line)
- `VAULT_ROLE_ID_FILE` and `VAULT_SECRET_ID_FILE`

Example:

```bash
VAULT_ENV_FILE=/secure/vault.env npm run configure:build:ready
# or
VAULT_ADDR=http://localhost:8200 VAULT_TOKEN_FILE=/secure/vault.token npm run configure:build:ready:op-only
```

Each run writes a summary artifact to:

- `ops/preflight/<timestamp>/production-bootstrap-summary.json`

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

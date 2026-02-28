# GhostDNS Rollout & Rollback

## Scope

This runbook covers staged rollout for the `ghostdns` profile introduced in `docker-compose.autonomy.yml`:

- `ghostdns-indexer`
- `ghostdns-resolver`
- `ghostdns-ai-policy`
- `ghostdns-attestor`

## Preflight

1. Ensure base autonomy stack is healthy (`ghost-registry`, `ghost-mapper`, `network-manager-service`).
2. Confirm `services/stack.env` includes GhostDNS vars.
3. For production, set:
   - `GHOSTDNS_ADMIN_TOKEN` (strong token)
   - `GHOSTDNS_ATTESTOR_SECRET` (strong secret)
   - `GHOSTDNS_POLICY_REQUIRED=1`
   - `GHOSTDNS_EMERGENCY_LOCK=0` (or `1` for freeze)

## Staged Rollout

`ghostdns-volume-init` runs automatically in the `ghostdns` profile to set writable ownership (`1000:1000`) on GhostDNS named volumes before non-root services start.

### Stage 1 — Policy service only

```bash
docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-ai-policy
```

Validation:

```bash
curl -fsS http://127.0.0.1:${GHOSTDNS_POLICY_HOST_PORT:-17813}/health
```

### Stage 2 — Indexer + Resolver

```bash
docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-indexer ghostdns-resolver
```

Validation:

```bash
curl -fsS http://127.0.0.1:${GHOSTDNS_INDEXER_HOST_PORT:-17811}/health
curl -fsS http://127.0.0.1:${GHOSTDNS_RESOLVER_HOST_PORT:-17812}/health
```

### Stage 3 — Attestor

```bash
docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-attestor
```

Validation:

```bash
curl -fsS http://127.0.0.1:${GHOSTDNS_ATTESTOR_HOST_PORT:-17814}/health
```

## Emergency Stop

1. Set `GHOSTDNS_EMERGENCY_LOCK=1`.
2. Restart only policy + dependent services:

```bash
docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-ai-policy ghostdns-resolver ghostdns-attestor
```

Outcome: policy evaluates to deny, resolver/attestor stops approving new operations.

## Full Rollback

```bash
docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns down
```

Optional state cleanup:

```bash
rm -f services/ghostdns-indexer/data/ghostdns-indexer-state.json
```

Evidence files remain under `services/ghostdns-attestor/data/evidence` for audit.

## CI Live-Smoke Artifacts

When `run_ghostdns_live=true` is used in `.github/workflows/ci.yml`, the `ghostdns-live-smoke` job uploads artifact bundle `ghostdns-live-artifacts` with:

- `compose-ps.txt`
   - Final container status snapshot for the `ghostdns` profile.
- `compose-logs.txt`
   - Consolidated compose logs (all services in the profile).
- `attestor-evidence/`
   - Evidence envelopes copied from `ghostdns-attestor:/data/evidence`.

Use these artifacts to triage failures quickly:

1. Check `compose-ps.txt` for unhealthy/restarting containers.
2. Inspect `compose-logs.txt` for first error stack traces.
3. Verify evidence generation behavior via `attestor-evidence/*.json`.

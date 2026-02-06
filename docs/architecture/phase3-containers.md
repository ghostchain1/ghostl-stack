# Phase 3: Least-Privilege Containers + Network Segmentation

Phase 3 packages the Low Balancer control plane with:

- **Least privilege** containers (non-root, `cap_drop: ALL`, `no-new-privileges`, read-only root FS).
- **Split networks**: `ghost_internal` (no egress) vs `ghost_interchain` (egress).
- **Secrets hygiene**: secrets injected via files (`*_FILE`) + Docker secrets overlay.

## Compose topology

Primary files:
- `docker-compose.phase3.yml`: hardened services + internal/interchain network split
- `docker-compose.phase3.secrets.yml`: optional overlay that mounts Docker secrets from `infra/docker/secrets/`

### Network split

- `ghost_internal` is marked `internal: true` (no outbound connectivity).
- `ghost_interchain` is the only network with outbound connectivity.
- `ghost-mapper` is attached to **both** and acts as the **only default egress gateway**:
  - Internal services reach L1/L2/L3 RPCs + metrics via `ghost-mapper:<port>`.
  - The mapper forwards to host-exposed ports per `infra/docker/ghost-mapper/mappings.phase3.hostports.json`.

## Secrets (no plaintext in compose)

The Phase 3 services support `*_FILE` secrets:

- `services/ghost-guard`: `ADMIN_TOKEN_FILE`, `PRIVATE_KEY_FILE`, `AI_SIGNER_PRIVATE_KEY_FILE`
- `services/ai-monitor`: `ADMIN_TOKEN_FILE`
- `services/bridge-service`: `ADMIN_TOKEN_FILE`
- `services/ghost-relayer`: `RELAYER_PRIVATE_KEY_FILE`, `L2_RELAYER_PRIVATE_KEY_FILE`

Use the secrets overlay + local secret files:
- `infra/docker/secrets.example/README.md` (instructions)

## Run

Baseline (no secrets overlay, observe-only defaults):

```bash
docker compose -f docker-compose.phase3.yml up -d --build
```

With secrets:

```bash
docker compose -f docker-compose.phase3.yml -f docker-compose.phase3.secrets.yml up -d --build
```

Optional relayer (requires contract addresses + relayer keys):

```bash
docker compose -f docker-compose.phase3.yml -f docker-compose.phase3.secrets.yml --profile interchain up -d --build
```


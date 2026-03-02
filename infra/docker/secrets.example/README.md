# Phase 3 Docker Secrets (Example)

`docker-compose.phase3.secrets.yml` expects secrets to exist under `infra/docker/secrets/` (gitignored).

Create the directory and files locally:

```bash
mkdir -p infra/docker/secrets

# Tokens (free-form strings)
printf '%s' 'change-me' > infra/docker/secrets/bridge_admin_token
printf '%s' 'change-me' > infra/docker/secrets/ghost_guard_admin_token

# Private keys (0x... hex). Leave empty if running in observe-only mode.
printf '%s' '' > infra/docker/secrets/ghost_guard_private_key
printf '%s' '' > infra/docker/secrets/ghost_guard_ai_private_key
printf '%s' '' > infra/docker/secrets/relayer_private_key
printf '%s' '' > infra/docker/secrets/relayer_private_key_l2

chmod 600 infra/docker/secrets/*
```

Run with secrets:

```bash
docker compose -f docker-compose.phase3.yml -f docker-compose.phase3.secrets.yml up -d --build
```


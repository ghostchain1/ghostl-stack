# Runbook: Prod Compose (SSO + JWKS Gateway)

## 1) Prepare secrets and env

Use `.env.example` as template, then provide real values for:

- `NEXTAUTH_SECRET`
- `KC_CLIENT_SECRET`
- `KC_DB_PASSWORD`
- `KC_ADMIN_PASSWORD`
- `KONG_E2E_CLIENT_SECRET`
- `GHOSTWALLET_MASTER_KEY`

## 2) Start stack

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d --build
```

## 3) Verify health

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env ps
curl -k -H 'Host: auth.ghostchain.cloud' https://127.0.0.1/realms/ghost-users/.well-known/openid-configuration
curl -k -H 'Host: api.ghostchain.cloud' https://127.0.0.1/identity/public/ping
```

## 4) Verify auth and route policy

```bash
npm run smoke:kong:auth -- .env
```

## 5) Secret rotation

1. Rotate Keycloak client secret (`ghost-web`, `ghost-e2e-cli`).
2. Update `.env` values (`KC_CLIENT_SECRET`, `KONG_E2E_CLIENT_SECRET`).
3. Restart affected services:

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d --force-recreate web ghost-jwks-guard
```

4. Re-run smoke checks.

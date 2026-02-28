#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker/docker-compose.e2e.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ghostl_e2e}"
ENV_FILE="${1:-$ROOT_DIR/.env}"
FALLBACK_ENV_FILE="$ROOT_DIR/.env.example"
EDGE_BASE_URL="${E2E_EDGE_BASE_URL:-http://127.0.0.1:18080}"
ARTIFACT_DIR="$ROOT_DIR/artifacts/e2e"
GATEWAY_ARTIFACT_DIR="$ROOT_DIR/artifacts/gateway"

mkdir -p "$ARTIFACT_DIR" "$GATEWAY_ARTIFACT_DIR"

compose_cmd() {
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  cp "$FALLBACK_ENV_FILE" "$ENV_FILE"
fi

if [ "$ENV_FILE" = "$ROOT_DIR/.env" ] && [ -f "$FALLBACK_ENV_FILE" ]; then
  required_env_keys=(
    NEXTAUTH_SECRET
    KC_CLIENT_SECRET
    KC_DB_PASSWORD
    KC_ADMIN_USER
    KC_ADMIN_PASSWORD
    KONG_OIDC_USERS_ISSUER
    KONG_OIDC_EMPLOYEES_ISSUER
    KONG_OIDC_ADMINS_ISSUER
    IDENTITY_DB_URL
    GOV_DB_URL
    GHOSTWALLET_MASTER_KEY
  )
  missing_key=0
  for key in "${required_env_keys[@]}"; do
    if ! grep -Eq "^${key}=.+" "$ENV_FILE"; then
      missing_key=1
      break
    fi
  done
  if [ "$missing_key" -eq 1 ]; then
    printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "Default .env missing e2e keys; using ${FALLBACK_ENV_FILE}"
    ENV_FILE="$FALLBACK_ENV_FILE"
  fi
fi

cleanup() {
  if [ "${E2E_KEEP_STACK:-0}" = "1" ]; then
    return
  fi
  compose_cmd down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

wait_for_url() {
  local url="$1"
  local host="$2"
  local expected="${3:-200}"
  for _ in $(seq 1 120); do
    code="$(curl -k -s -o /dev/null -w '%{http_code}' -H "Host: ${host}" "$url" || true)"
    if [ "$code" = "$expected" ]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

assert_location_contains() {
  local path="$1"
  local expected_fragment="$2"
  local extra_header="${3:-}"
  local headers
  headers="$(mktemp)"
  if [ -n "$extra_header" ]; then
    curl -k -sS -D "$headers" -o /dev/null -H 'Host: app.ghostchain.cloud' -H "$extra_header" "${EDGE_BASE_URL}${path}" || true
  else
    curl -k -sS -D "$headers" -o /dev/null -H 'Host: app.ghostchain.cloud' "${EDGE_BASE_URL}${path}" || true
  fi
  status="$(awk 'NR==1 {print $2}' "$headers")"
  location="$(awk 'BEGIN { IGNORECASE=1 } /^location:/ {sub(/\r$/, "", $2); print $2; exit}' "$headers")"
  rm -f "$headers"

  if [ "$status" != "307" ] && [ "$status" != "302" ]; then
    echo "expected redirect for ${path}, got ${status}" >&2
    exit 1
  fi

  if [[ "$location" != *"$expected_fragment"* ]]; then
    echo "unexpected location for ${path}: ${location} (expected fragment: ${expected_fragment})" >&2
    exit 1
  fi
}

log "Starting e2e stack"
if [ "${E2E_BUILD:-1}" = "1" ]; then
  compose_cmd up -d --build --force-recreate
else
  compose_cmd up -d --force-recreate
fi

log "Waiting for Keycloak realms"
wait_for_url "${EDGE_BASE_URL}/realms/ghost-users/.well-known/openid-configuration" 'auth.ghostchain.cloud' 200
wait_for_url "${EDGE_BASE_URL}/realms/ghost-employees/.well-known/openid-configuration" 'auth.ghostchain.cloud' 200
wait_for_url "${EDGE_BASE_URL}/realms/ghost-admins/.well-known/openid-configuration" 'auth.ghostchain.cloud' 200

log "Waiting for web login"
wait_for_url "${EDGE_BASE_URL}/login" 'app.ghostchain.cloud' 200

log "Waiting for gateway"
wait_for_url "${EDGE_BASE_URL}/identity/public/ping" 'api.ghostchain.cloud' 404 || true

log "Running gateway JWKS matrix"
KEYCLOAK_PUBLIC_BASE_URL="${EDGE_BASE_URL}" \
KEYCLOAK_PUBLIC_HOST='auth.ghostchain.cloud' \
GATEWAY_BASE_URL="${EDGE_BASE_URL}" \
GATEWAY_HOST_HEADER='api.ghostchain.cloud' \
bash "$ROOT_DIR/scripts/smoke/kong-realm-auth.sh" "$ENV_FILE" | tee "$GATEWAY_ARTIFACT_DIR/e2e-kong-jwks-smoke.log"

log "Validating login realm redirect flow"
assert_location_contains '/api/auth/realm-login?realm=users' '/api/auth/realm-start?callbackUrl=%2Fdashboard'
assert_location_contains '/api/auth/realm-start?callbackUrl=%2Fdashboard' '/realms/ghost-users/protocol/openid-connect/auth' 'Cookie: ghost_realm=users'
assert_location_contains '/dashboard' '/login?returnTo=%2Fdashboard'

log "Asserting live MFA policy metadata"
KC_ADMIN_USER_VALUE="$(grep '^KC_ADMIN_USER=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
KC_ADMIN_PASSWORD_VALUE="$(grep '^KC_ADMIN_PASSWORD=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"

ADMIN_TOKEN="$(
  curl -k -fsS -X POST "${EDGE_BASE_URL}/realms/master/protocol/openid-connect/token" \
    -H 'Host: auth.ghostchain.cloud' \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode grant_type=password \
    --data-urlencode client_id=admin-cli \
    --data-urlencode username="${KC_ADMIN_USER_VALUE}" \
    --data-urlencode password="${KC_ADMIN_PASSWORD_VALUE}" \
    | node -e 'let d="";process.stdin.on("data",(c)=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d||"{}");if(!j.access_token)process.exit(1);process.stdout.write(j.access_token);});'
)"

for realm in ghost-employees ghost-admins; do
  realm_file="$ARTIFACT_DIR/${realm}.json"
  required_actions_file="$ARTIFACT_DIR/${realm}-required-actions.json"

  curl -k -fsS \
    -H 'Host: auth.ghostchain.cloud' \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${EDGE_BASE_URL}/admin/realms/${realm}" \
    > "$realm_file"

  curl -k -fsS \
    -H 'Host: auth.ghostchain.cloud' \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${EDGE_BASE_URL}/admin/realms/${realm}/authentication/required-actions" \
    > "$required_actions_file"

  node - "$realm_file" "$required_actions_file" <<'NODE'
const fs = require('fs');
const realmPath = process.argv[2];
const requiredActionsPath = process.argv[3];
const realmData = JSON.parse(fs.readFileSync(realmPath, 'utf8'));
const requiredActions = JSON.parse(fs.readFileSync(requiredActionsPath, 'utf8'));
const hasTotpPolicy = realmData.otpPolicyType === 'totp';
const hasRequiredTotp =
  Array.isArray(requiredActions) &&
  requiredActions.some((entry) => entry.alias === 'CONFIGURE_TOTP' && entry.enabled === true && entry.defaultAction === true);
if (!hasTotpPolicy || !hasRequiredTotp) {
  console.error(`MFA policy assertion failed for ${realmData.realm || realmPath}`);
  process.exit(1);
}
NODE

done

cat > "$ARTIFACT_DIR/report.txt" <<REPORT
E2E smoke: PASS
- JWKS gateway matrix: artifacts/gateway/e2e-kong-jwks-smoke.log
- Realm redirects validated via app.ghostchain.cloud
- MFA live config assertions captured for ghost-employees and ghost-admins
REPORT

log "E2E smoke completed"

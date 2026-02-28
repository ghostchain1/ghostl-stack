#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"
FALLBACK_ENV_FILE="$ROOT_DIR/.env.example"
GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-https://127.0.0.1}"
GATEWAY_HOST_HEADER="${GATEWAY_HOST_HEADER:-api.ghostchain.cloud}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_env_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    fail "Missing required env var ${name} in ${ENV_FILE}"
  fi
}

issuer_origin() {
  local issuer="$1"
  node - "$issuer" <<'NODE'
const issuer = process.argv[2] || "";
try {
  const url = new URL(issuer);
  process.stdout.write(url.origin);
} catch {
  process.exit(1);
}
NODE
}

if [ ! -f "$ENV_FILE" ]; then
  fail "Env file not found: $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

if [ "$ENV_FILE" != "$FALLBACK_ENV_FILE" ] && [ -f "$FALLBACK_ENV_FILE" ]; then
  need_fallback_env=0
  if [ -z "${KONG_OIDC_USERS_ISSUER:-}" ] && { [ -z "${KEYCLOAK_BASE_URL:-}" ] || [ -z "${KEYCLOAK_REALM_USERS:-}" ]; }; then
    need_fallback_env=1
  fi
  if [ -z "${KONG_OIDC_EMPLOYEES_ISSUER:-}" ] && { [ -z "${KEYCLOAK_BASE_URL:-}" ] || [ -z "${KEYCLOAK_REALM_EMPLOYEES:-}" ]; }; then
    need_fallback_env=1
  fi
  if [ -z "${KONG_OIDC_ADMINS_ISSUER:-}" ] && { [ -z "${KEYCLOAK_BASE_URL:-}" ] || [ -z "${KEYCLOAK_REALM_ADMINS:-}" ]; }; then
    need_fallback_env=1
  fi
  if [ -z "${KC_ADMIN_USER:-}" ] && [ -z "${KEYCLOAK_ADMIN:-}" ]; then
    need_fallback_env=1
  fi
  if [ -z "${KC_ADMIN_PASSWORD:-}" ] && [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
    need_fallback_env=1
  fi
  if [ "$need_fallback_env" -eq 1 ]; then
    log "Primary env missing SSO vars; loading fallback values from ${FALLBACK_ENV_FILE}"
    # shellcheck disable=SC1090
    set -a; . "$FALLBACK_ENV_FILE"; set +a
  fi
fi

if [ -z "${KONG_OIDC_USERS_ISSUER:-}" ] && [ -n "${KEYCLOAK_BASE_URL:-}" ] && [ -n "${KEYCLOAK_REALM_USERS:-}" ]; then
  KONG_OIDC_USERS_ISSUER="${KEYCLOAK_BASE_URL%/}/realms/${KEYCLOAK_REALM_USERS}"
fi
if [ -z "${KONG_OIDC_EMPLOYEES_ISSUER:-}" ] && [ -n "${KEYCLOAK_BASE_URL:-}" ] && [ -n "${KEYCLOAK_REALM_EMPLOYEES:-}" ]; then
  KONG_OIDC_EMPLOYEES_ISSUER="${KEYCLOAK_BASE_URL%/}/realms/${KEYCLOAK_REALM_EMPLOYEES}"
fi
if [ -z "${KONG_OIDC_ADMINS_ISSUER:-}" ] && [ -n "${KEYCLOAK_BASE_URL:-}" ] && [ -n "${KEYCLOAK_REALM_ADMINS:-}" ]; then
  KONG_OIDC_ADMINS_ISSUER="${KEYCLOAK_BASE_URL%/}/realms/${KEYCLOAK_REALM_ADMINS}"
fi
if [ -z "${KC_ADMIN_USER:-}" ] && [ -n "${KEYCLOAK_ADMIN:-}" ]; then
  KC_ADMIN_USER="$KEYCLOAK_ADMIN"
fi
if [ -z "${KC_ADMIN_PASSWORD:-}" ] && [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
  KC_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"
fi

require_env_var "KONG_OIDC_USERS_ISSUER"
require_env_var "KONG_OIDC_EMPLOYEES_ISSUER"
require_env_var "KONG_OIDC_ADMINS_ISSUER"
require_env_var "KC_ADMIN_USER"
require_env_var "KC_ADMIN_PASSWORD"

if [ -z "${KEYCLOAK_BASE_URL:-}" ]; then
  KEYCLOAK_BASE_URL="$(issuer_origin "$KONG_OIDC_USERS_ISSUER")"
fi
require_env_var "KEYCLOAK_BASE_URL"

E2E_CLIENT_ID="${KONG_E2E_CLIENT_ID:-ghost-e2e-cli}"
E2E_CLIENT_SECRET="${KONG_E2E_CLIENT_SECRET:-ghost-e2e-secret}"
KEYCLOAK_PUBLIC_BASE_URL="${KEYCLOAK_PUBLIC_BASE_URL:-$KEYCLOAK_BASE_URL}"
KEYCLOAK_PUBLIC_HOST="${KEYCLOAK_PUBLIC_HOST:-}"

KEYCLOAK_HOST_HEADER_ARGS=()
if [ -n "$KEYCLOAK_PUBLIC_HOST" ]; then
  KEYCLOAK_HOST_HEADER_ARGS=(-H "Host: ${KEYCLOAK_PUBLIC_HOST}")
fi

realm_from_issuer() {
  local issuer="$1"
  node - "$issuer" <<'NODE'
const issuer = process.argv[2] || "";
try {
  const url = new URL(issuer);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((item) => item === "realms");
  if (idx === -1 || !parts[idx + 1]) process.exit(1);
  process.stdout.write(parts[idx + 1]);
} catch {
  process.exit(1);
}
NODE
}

wait_for_keycloak_path() {
  local path="$1"
  local expected="${2:-200}"
  local status=""
  for _ in $(seq 1 120); do
    status="$(curl -k -s -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT_SECONDS" \
      "${KEYCLOAK_HOST_HEADER_ARGS[@]}" \
      "${KEYCLOAK_PUBLIC_BASE_URL%/}${path}" || true)"
    if [ "$status" = "$expected" ]; then
      return 0
    fi
    sleep 1
  done
  fail "Timed out waiting for Keycloak endpoint ${path} (last status: ${status:-unknown})"
}

wait_for_realm_discovery() {
  local issuer="$1"
  local realm
  realm="$(realm_from_issuer "$issuer")"
  wait_for_keycloak_path "/realms/${realm}/.well-known/openid-configuration" "200"
}

mint_client_token() {
  local issuer="$1"
  local realm
  realm="$(realm_from_issuer "$issuer")"
  curl -k -fsS --max-time "$CURL_TIMEOUT_SECONDS" \
    -X POST "${KEYCLOAK_PUBLIC_BASE_URL%/}/realms/${realm}/protocol/openid-connect/token" \
    "${KEYCLOAK_HOST_HEADER_ARGS[@]}" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=${E2E_CLIENT_ID}" \
    --data-urlencode "client_secret=${E2E_CLIENT_SECRET}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d||"{}");if(!j.access_token){process.exit(1)}process.stdout.write(j.access_token);});'
}

mint_master_admin_token() {
  curl -k -fsS --max-time "$CURL_TIMEOUT_SECONDS" \
    -X POST "${KEYCLOAK_PUBLIC_BASE_URL%/}/realms/master/protocol/openid-connect/token" \
    "${KEYCLOAK_HOST_HEADER_ARGS[@]}" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=admin-cli" \
    --data-urlencode "username=${KC_ADMIN_USER}" \
    --data-urlencode "password=${KC_ADMIN_PASSWORD}" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d||"{}");if(!j.access_token){process.exit(1)}process.stdout.write(j.access_token);});'
}

token_exp_epoch() {
  local token="$1"
  node - "$token" <<'NODE'
const token = process.argv[2] || "";
const payload = token.split(".")[1] || "";
const raw = payload.replace(/-/g, "+").replace(/_/g, "/");
const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
const parsed = JSON.parse(Buffer.from(`${raw}${pad}`, "base64").toString("utf8"));
process.stdout.write(String(parsed.exp || 0));
NODE
}

request_status_and_body() {
  local path="$1"
  local token="${2:-}"
  local outfile
  outfile="$(mktemp)"

  local status
  if [ -n "$token" ]; then
    status="$(curl -k -sS --max-time "$CURL_TIMEOUT_SECONDS" \
      -H "Host: $GATEWAY_HOST_HEADER" \
      -H "Authorization: Bearer $token" \
      -o "$outfile" -w "%{http_code}" \
      "${GATEWAY_BASE_URL}${path}" || true)"
  else
    status="$(curl -k -sS --max-time "$CURL_TIMEOUT_SECONDS" \
      -H "Host: $GATEWAY_HOST_HEADER" \
      -o "$outfile" -w "%{http_code}" \
      "${GATEWAY_BASE_URL}${path}" || true)"
  fi

  local body
  body="$(tr -d '\n' < "$outfile" | cut -c1-200)"
  rm -f "$outfile"
  printf '%s|%s' "$status" "$body"
}

status_not_in() {
  local status="$1"
  shift
  local blocked=("$@")
  local code
  for code in "${blocked[@]}"; do
    if [ "$status" = "$code" ]; then
      return 1
    fi
  done
  return 0
}

run_case() {
  local label="$1"
  local mode="$2"
  local path="$3"
  local token="$4"
  shift 4
  local expectations=("$@")

  local result
  result="$(request_status_and_body "$path" "$token")"
  local status="${result%%|*}"
  local body="${result#*|}"

  local pass=1
  if [ "$mode" = "eq" ]; then
    local expected="${expectations[0]}"
    if [ "$status" = "$expected" ]; then
      pass=0
    fi
  elif [ "$mode" = "not-in" ]; then
    if status_not_in "$status" "${expectations[@]}"; then
      pass=0
    fi
  else
    fail "Unknown assertion mode: $mode"
  fi

  if [ "$pass" -eq 0 ]; then
    log "PASS: ${label} -> ${status}"
    return 0
  fi

  if [ "$mode" = "eq" ]; then
    log "FAIL: ${label} -> got ${status}, expected ${expectations[0]} :: ${body}"
  else
    log "FAIL: ${label} -> got ${status}, blocked [${expectations[*]}] :: ${body}"
  fi
  return 1
}

log "Gateway base: ${GATEWAY_BASE_URL}"
log "Gateway host header: ${GATEWAY_HOST_HEADER}"
log "Waiting for Keycloak discovery endpoints"
wait_for_realm_discovery "$KONG_OIDC_USERS_ISSUER"
wait_for_realm_discovery "$KONG_OIDC_EMPLOYEES_ISSUER"
wait_for_realm_discovery "$KONG_OIDC_ADMINS_ISSUER"
wait_for_keycloak_path "/realms/master/.well-known/openid-configuration" "200"
log "Minting realm tokens via Keycloak OIDC"

USERS_TOKEN_EXPIRE_TEST="$(mint_client_token "$KONG_OIDC_USERS_ISSUER")"
USERS_TOKEN="$(mint_client_token "$KONG_OIDC_USERS_ISSUER")"
EMPLOYEES_TOKEN="$(mint_client_token "$KONG_OIDC_EMPLOYEES_ISSUER")"
ADMINS_TOKEN="$(mint_client_token "$KONG_OIDC_ADMINS_ISSUER")"
MASTER_TOKEN="$(mint_master_admin_token)"

failures=0

run_case "public route without token" "not-in" "/identity/public/ping" "" "401" "403" || failures=$((failures + 1))
run_case "user route without token" "eq" "/identity/user/ping" "" "401" || failures=$((failures + 1))
run_case "users token -> user route" "not-in" "/identity/user/ping" "$USERS_TOKEN" "401" "403" || failures=$((failures + 1))
run_case "users token -> employee route blocked" "eq" "/identity/employee/ping" "$USERS_TOKEN" "403" || failures=$((failures + 1))
run_case "employees token -> employee route" "not-in" "/identity/employee/ping" "$EMPLOYEES_TOKEN" "401" "403" || failures=$((failures + 1))
run_case "employees token -> admin route blocked" "eq" "/identity/admin/ping" "$EMPLOYEES_TOKEN" "403" || failures=$((failures + 1))
run_case "admins token -> admin route" "not-in" "/identity/admin/ping" "$ADMINS_TOKEN" "401" "403" || failures=$((failures + 1))
run_case "users token -> governance route blocked" "eq" "/governance/ping" "$USERS_TOKEN" "403" || failures=$((failures + 1))
run_case "admins token -> governance route" "not-in" "/governance/ping" "$ADMINS_TOKEN" "401" "403" || failures=$((failures + 1))
run_case "admins token missing governance_admin role" "eq" "/governance/execute" "$ADMINS_TOKEN" "403" || failures=$((failures + 1))
run_case "wrong issuer token blocked" "eq" "/identity/user/ping" "$MASTER_TOKEN" "401" || failures=$((failures + 1))

# Expired-token check: wait until a short-lived client token expires.
USERS_EXP="$(token_exp_epoch "$USERS_TOKEN_EXPIRE_TEST")"
NOW="$(date +%s)"
if [ "$USERS_EXP" -gt "$NOW" ]; then
  EXTRA_EXPIRY_WAIT_SECONDS="${EXTRA_EXPIRY_WAIT_SECONDS:-6}"
  SLEEP_FOR="$((USERS_EXP - NOW + EXTRA_EXPIRY_WAIT_SECONDS))"
  if [ "$SLEEP_FOR" -gt 0 ] && [ "$SLEEP_FOR" -le 90 ]; then
    log "Waiting ${SLEEP_FOR}s for token expiry check"
    sleep "$SLEEP_FOR"
  fi
fi
run_case "expired token blocked" "eq" "/identity/user/ping" "$USERS_TOKEN_EXPIRE_TEST" "401" || failures=$((failures + 1))

if [ "$failures" -ne 0 ]; then
  fail "Kong realm auth smoke failed (${failures} case(s) failed)"
fi

log "Kong realm auth smoke: OK"

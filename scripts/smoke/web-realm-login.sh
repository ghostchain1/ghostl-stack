#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_PORT="${WEB_REALM_SMOKE_PORT:-3320}"
BASE_URL="${WEB_REALM_SMOKE_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
BUILD_FLAG="${WEB_REALM_SMOKE_BUILD:-0}"
LOG_FILE="${WEB_REALM_SMOKE_LOG:-/tmp/ghostl-web-realm-login-smoke.log}"
DIST_DIR="${NEXT_DIST_DIR:-.next-ghost}"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "ERROR: $*"
  if [ -f "$LOG_FILE" ]; then
    log "Recent server log:"
    tail -n 40 "$LOG_FILE" || true
  fi
  exit 1
}

ensure_build() {
  if [ "$BUILD_FLAG" = "1" ]; then
    log "Building apps/web (WEB_REALM_SMOKE_BUILD=1)"
    npm run build -w apps/web >/tmp/ghostl-web-realm-login-build.log 2>&1 || {
      tail -n 60 /tmp/ghostl-web-realm-login-build.log || true
      fail "apps/web build failed"
    }
  fi

  if [ ! -f "$ROOT_DIR/apps/web/${DIST_DIR}/BUILD_ID" ]; then
    fail "Missing apps/web build output at apps/web/${DIST_DIR}. Run 'npm run build -w apps/web' or set WEB_REALM_SMOKE_BUILD=1."
  fi
}

wait_for_server() {
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/login" || true)"
    if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
      return 0
    fi
    sleep 1
  done
  fail "web server did not become ready at ${BASE_URL}"
}

extract_status() {
  local headers_file="$1"
  awk 'NR==1 { print $2; exit }' "$headers_file"
}

extract_location() {
  local headers_file="$1"
  awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/\r$/, "", $2); print $2; exit }' "$headers_file"
}

extract_set_cookie() {
  local headers_file="$1"
  awk 'BEGIN { IGNORECASE=1 } /^set-cookie:/ { sub(/\r$/, ""); print; exit }' "$headers_file"
}

assert_realm_login() {
  local label="$1"
  local path="$2"
  local expected_location_fragment="$3"
  local expected_cookie_fragment="${4:-}"

  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /dev/null "${BASE_URL}${path}" || true

  local status
  status="$(extract_status "$headers")"
  if [ "$status" != "307" ]; then
    rm -f "$headers"
    fail "${label}: expected status 307, got ${status:-<empty>}"
  fi

  local location
  location="$(extract_location "$headers")"
  if [[ "$location" != *"$expected_location_fragment"* ]]; then
    rm -f "$headers"
    fail "${label}: unexpected Location '${location}' (expected fragment '${expected_location_fragment}')"
  fi

  if [ -n "$expected_cookie_fragment" ]; then
    local cookie
    cookie="$(extract_set_cookie "$headers")"
    if [[ "$cookie" != *"$expected_cookie_fragment"* ]]; then
      rm -f "$headers"
      fail "${label}: unexpected Set-Cookie '${cookie}' (expected fragment '${expected_cookie_fragment}')"
    fi
  fi

  rm -f "$headers"
  log "PASS: ${label}"
}

assert_health_ok() {
  local headers
  headers="$(mktemp)"
  local body
  body="$(mktemp)"
  curl -sS -D "$headers" -o "$body" "${BASE_URL}/health" || true

  local status
  status="$(extract_status "$headers")"
  if [ "$status" != "200" ]; then
    rm -f "$headers" "$body"
    fail "health endpoint: expected status 200, got ${status:-<empty>}"
  fi

  if ! grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$body"; then
    rm -f "$headers" "$body"
    fail "health endpoint: missing ok=true marker"
  fi

  rm -f "$headers" "$body"
  log "PASS: health endpoint is public and healthy"
}

assert_redirect() {
  local label="$1"
  local path="$2"
  local expected_location_fragment="$3"

  local headers
  headers="$(mktemp)"
  curl -sS -D "$headers" -o /dev/null "${BASE_URL}${path}" || true

  local status
  status="$(extract_status "$headers")"
  if [ "$status" != "307" ]; then
    rm -f "$headers"
    fail "${label}: expected status 307, got ${status:-<empty>}"
  fi

  local location
  location="$(extract_location "$headers")"
  if [[ "$location" != *"$expected_location_fragment"* ]]; then
    rm -f "$headers"
    fail "${label}: unexpected Location '${location}' (expected fragment '${expected_location_fragment}')"
  fi

  rm -f "$headers"
  log "PASS: ${label}"
}

start_server() {
  log "Starting web server on port ${WEB_PORT}"
  : >"$LOG_FILE"
  (
    cd "$ROOT_DIR"
    npm run start -w apps/web -- --port "$WEB_PORT" >"$LOG_FILE" 2>&1
  ) &
  SERVER_PID=$!
}

stop_server() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

main() {
  ensure_build
  start_server
  trap stop_server EXIT INT TERM
  wait_for_server
  assert_health_ok

  assert_realm_login \
    "invalid realm redirects to login" \
    "/api/auth/realm-login?realm=nope" \
    "/login"

  assert_realm_login \
    "users default callback" \
    "/api/auth/realm-login?realm=users" \
    "/api/auth/realm-start?callbackUrl=%2Fdashboard" \
    "ghost_realm=users"

  assert_realm_login \
    "employees default callback" \
    "/api/auth/realm-login?realm=employees" \
    "/api/auth/realm-start?callbackUrl=%2Fincidents" \
    "ghost_realm=employees"

  assert_realm_login \
    "admins default callback" \
    "/api/auth/realm-login?realm=admins" \
    "/api/auth/realm-start?callbackUrl=%2Fgovernance" \
    "ghost_realm=admins"

  assert_realm_login \
    "safe returnTo is preserved" \
    "/api/auth/realm-login?realm=admins&returnTo=%2Ftreasury" \
    "/api/auth/realm-start?callbackUrl=%2Ftreasury" \
    "ghost_realm=admins"

  assert_realm_login \
    "unsafe returnTo is ignored" \
    "/api/auth/realm-login?realm=admins&returnTo=https%3A%2F%2Fevil.example" \
    "/api/auth/realm-start?callbackUrl=%2Fgovernance" \
    "ghost_realm=admins"

  assert_realm_login \
    "returnTo query string preserved" \
    "/api/auth/realm-login?realm=users&returnTo=%2Fwallet%3Ftab%3Dactivity" \
    "/api/auth/realm-start?callbackUrl=%2Fwallet%3Ftab%3Dactivity" \
    "ghost_realm=users"

  assert_redirect \
    "protected route redirects to login with returnTo" \
    "/wallet" \
    "/login?returnTo=%2Fwallet"

  assert_redirect \
    "protected route query is preserved in returnTo" \
    "/dashboard?tab=activity" \
    "/login?returnTo=%2Fdashboard%3Ftab%3Dactivity"

  log "Web realm-login smoke: OK"
}

main "$@"

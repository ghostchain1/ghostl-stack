#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

COMPOSE_FILES=(
  "docker-compose.autonomy.yml"
  "docker-compose.dev.yml"
  "docker-compose.econ.devnet.yml"
  "docker-compose.econ.testnet.yml"
  "docker-compose.econ.mainnet.yml"
  "docker-compose.yml"
  "apps/docker-compose.yml"
  "observability/infra/docker-compose.yml"
  # SOVEREIGN: additional compose files added to hardening gate.
  "docker-compose.phase3.yml"
  "docker-compose.sovereign.yml"
  "docker-compose.ghostbrain.yml"
  "docker-compose.cascading-finality.yml"
  "infra/docker/docker-compose.prod.yml"
)

FAILURES=0

has_line() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$file" >/dev/null 2>&1
  else
    grep -En "$pattern" "$file" >/dev/null 2>&1
  fi
}

check_file() {
  local file="$1"
  local path="$ROOT_DIR/$file"
  if [[ ! -f "$path" ]]; then
    echo "[compose-hardening] WARN missing: $file"
    return 0
  fi

  echo "[compose-hardening] scanning $file"

  local uses_extends="false"
  if has_line "^[[:space:]]*extends:[[:space:]]*$" "$path"; then
    uses_extends="true"
  fi

  if has_line "^[[:space:]]*privileged:[[:space:]]*true[[:space:]]*$" "$path"; then
    echo "[compose-hardening] FAIL privileged=true found in $file"
    FAILURES=$((FAILURES + 1))
  fi

  local rendered_file=""
  if [[ "$uses_extends" == "true" ]] && command -v docker >/dev/null 2>&1; then
    rendered_file="$(mktemp)"
    if ! (
      cd "$ROOT_DIR" && \
      ECON_GRAFANA_ADMIN_PASSWORD="${ECON_GRAFANA_ADMIN_PASSWORD:-validation-placeholder}" \
      MAINNET_GATE_RPC="${MAINNET_GATE_RPC:-http://placeholder-rpc.invalid}" \
      MAINNET_GATE_ADDRESS="${MAINNET_GATE_ADDRESS:-0x0000000000000000000000000000000000000001}" \
      RECEIPT_SIGNING_SECRET="${RECEIPT_SIGNING_SECRET:-validation-placeholder}" \
      SNAPSHOT_SIGNING_SECRET="${SNAPSHOT_SIGNING_SECRET:-validation-placeholder}" \
      docker compose -f "$file" config >"$rendered_file"
    ) 2>/dev/null; then
      rm -f "$rendered_file"
      rendered_file=""
      echo "[compose-hardening] WARN unable to render effective config for $file"
    else
      echo "[compose-hardening] INFO using rendered effective config for $file"
    fi
  fi

  local check_target="$path"
  if [[ -n "$rendered_file" ]]; then
    check_target="$rendered_file"
  fi

  if has_line "^[[:space:]]*user:[[:space:]]*" "$check_target"; then
    echo "[compose-hardening] PASS user configured in $file"
  else
    echo "[compose-hardening] WARN no explicit user in $file"
  fi

  if has_line "^[[:space:]]*cap_drop:[[:space:]]*($|\[)" "$check_target"; then
    echo "[compose-hardening] PASS cap_drop present in $file"
  else
    echo "[compose-hardening] WARN cap_drop missing in $file"
  fi

  if has_line "no-new-privileges:true" "$check_target"; then
    echo "[compose-hardening] PASS no-new-privileges present in $file"
  else
    echo "[compose-hardening] WARN no-new-privileges missing in $file"
  fi

  if has_line "^[[:space:]]*healthcheck:[[:space:]]*$" "$check_target"; then
    echo "[compose-hardening] PASS healthcheck present in $file"
  else
    echo "[compose-hardening] WARN healthcheck missing in $file"
  fi

  if has_line "^[[:space:]]*network_mode:[[:space:]]*host[[:space:]]*$" "$path"; then
    echo "[compose-hardening] FAIL network_mode: host found in $file"
    FAILURES=$((FAILURES + 1))
  fi

  if command -v rg >/dev/null 2>&1; then
    if rg -n "^[[:space:]]*image:[[:space:]]*[^@]+:[^[:space:]]+$" "$path" \
      | rg -v "@sha256:|ghostl/.+:local|\$\{[A-Za-z0-9_]+" >/dev/null 2>&1; then
      echo "[compose-hardening] WARN unpinned image tags found in $file"
    else
      echo "[compose-hardening] PASS images appear digest-pinned or build-based in $file"
    fi
  else
    if grep -En "^[[:space:]]*image:[[:space:]]*[^@]+:[^[:space:]]+$" "$path" \
      | grep -Ev "@sha256:|ghostl/.+:local|\\$\\{[A-Za-z0-9_]+" >/dev/null 2>&1; then
      echo "[compose-hardening] WARN unpinned image tags found in $file"
    else
      echo "[compose-hardening] PASS images appear digest-pinned or build-based in $file"
    fi
  fi

  local is_prod_like="false"
  if [[ "$file" == *"testnet"* || "$file" == *"mainnet"* || "$file" == "docker-compose.yml" ]]; then
    is_prod_like="true"
  fi

  if [[ "$is_prod_like" == "true" ]]; then
    if has_line "GF_SECURITY_ADMIN_PASSWORD[[:space:]]*[:=][[:space:]]*(\\$\\{[^}]*:-admin\\}|admin)([[:space:]]*$|[[:space:]]*#|[[:space:]]*,)" "$check_target"; then
      echo "[compose-hardening] FAIL weak Grafana admin password default found in $file"
      FAILURES=$((FAILURES + 1))
    fi
  fi

  # SOVEREIGN: Kong admin port must not be exposed on 0.0.0.0.
  if has_line "KONG_ADMIN_LISTEN[[:space:]]*:[[:space:]]*[\"']?0\\.0\\.0\\.0:" "$check_target"; then
    echo "[compose-hardening] FAIL KONG_ADMIN_LISTEN bound to 0.0.0.0 found in $file (expected 127.0.0.1:8001)"
    FAILURES=$((FAILURES + 1))
  else
    if has_line "KONG_ADMIN_LISTEN" "$check_target"; then
      echo "[compose-hardening] PASS KONG_ADMIN_LISTEN not bound to 0.0.0.0 in $file"
    fi
  fi

  # SOVEREIGN: trustForwardHeader=true allows client-forged X-Forwarded-For bypass.
  if has_line "trustForwardHeader[[:space:]]*=[[:space:]]*true" "$check_target"; then
    echo "[compose-hardening] FAIL forwardauth.trustForwardHeader=true found in $file"
    FAILURES=$((FAILURES + 1))
  else
    if has_line "trustForwardHeader" "$check_target"; then
      echo "[compose-hardening] PASS trustForwardHeader is not true in $file"
    fi
  fi

  # SOVEREIGN: writable docker.sock mounts require explicit justification.
  if command -v rg >/dev/null 2>&1; then
    if rg -n "/var/run/docker\\.sock:/var/run/docker\\.sock[^:]" "$path" \
        | rg -v "docker\\.sock:ro" >/dev/null 2>&1; then
      echo "[compose-hardening] WARN writable docker.sock mount found in $file (verify DOCKER_ACTIONS_ENABLED=false where unused)"
    fi
  else
    if grep -En "/var/run/docker\\.sock:/var/run/docker\\.sock[^:]" "$path" \
        | grep -Ev "docker\\.sock:ro" >/dev/null 2>&1; then
      echo "[compose-hardening] WARN writable docker.sock mount found in $file (verify DOCKER_ACTIONS_ENABLED=false where unused)"
    fi
  fi

  if [[ -n "$rendered_file" ]]; then
    rm -f "$rendered_file"
  fi
}

for compose in "${COMPOSE_FILES[@]}"; do
  check_file "$compose"
done

if [[ "$FAILURES" -gt 0 ]]; then
  echo "[compose-hardening] FAIL total=$FAILURES"
  exit 1
fi

echo "[compose-hardening] PASS"

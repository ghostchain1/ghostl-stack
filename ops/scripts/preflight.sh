#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ops/preflight/$(date -u +%Y%m%d-%H%M%S)"
RUN_L1_DOCTOR="false"
EMIT_L1_EVIDENCE="false"
mkdir -p "$OUT_DIR/compose"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

usage() {
  cat <<'USAGE'
Usage: preflight.sh [--l1-doctor] [--emit-l1-evidence]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --l1-doctor) RUN_L1_DOCTOR="true"; shift;;
    --emit-l1-evidence) EMIT_L1_EVIDENCE="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

log "Preflight output: $OUT_DIR"

rg --files -g 'docker-compose*.yml' \
  -g '!**/backups/**' \
  -g '!**/ops/snapshots/**' \
  -g '!**/infra/docker/_backup/**' \
  -g '!**/infra/docker/compose/**' \
  -g '!**/services/**/rollback/**' \
  -g '!**/interop-devnet/**' \
  "$ROOT_DIR" | sort > "$OUT_DIR/compose-files.txt"

if docker info >/dev/null 2>&1; then
  docker ps --format '{{json .}}' > "$OUT_DIR/docker-ps.json" || true
  docker compose ls --format json > "$OUT_DIR/compose-projects.json" || true
  docker network ls --format '{{json .}}' > "$OUT_DIR/docker-networks.json" || true
  docker volume ls --format '{{json .}}' > "$OUT_DIR/docker-volumes.json" || true
else
  log "Docker daemon not reachable; skipping runtime capture."
fi

if [[ "$RUN_L1_DOCTOR" == "true" && -x "$ROOT_DIR/infra/scripts/doctor-l1.sh" ]]; then
  log "Running L1 doctor"
  if "$ROOT_DIR/infra/scripts/doctor-l1.sh" > "$OUT_DIR/l1-doctor.log" 2>&1; then
    log "L1 doctor: ok"
  else
    log "L1 doctor: failed (see $OUT_DIR/l1-doctor.log)"
  fi
fi

compose_slug() {
  local rel="$1"
  rel="${rel//\//__}"
  printf '%s' "$rel"
}

render_compose() {
  local out="$1"
  shift
  if docker compose "$@" config --format json > "$out" 2>"$out.err"; then
    rm -f "$out.err"
    return 0
  fi
  return 1
}

while IFS= read -r file; do
  rel="${file#$ROOT_DIR/}"
  slug="$(compose_slug "$rel")"
  out="$OUT_DIR/compose/${slug%.yml}.json"
  compose_dir="$(dirname "$file")"
  if [[ "$rel" == "infra/opstack/docker-compose.challengers.yml" ]]; then
    base="$ROOT_DIR/infra/opstack/docker-compose.yml"
    l3="$ROOT_DIR/infra/opstack/docker-compose.l3.yml"
    if ! render_compose "$out" -f "$base" -f "$l3" -f "$file"; then
      log "compose config failed for $rel (see $out.err)"
    fi
    continue
  fi
  if [[ "$rel" == "infra/opstack/docker-compose.l3.yml" ]]; then
    base="$ROOT_DIR/infra/opstack/docker-compose.yml"
    if ! render_compose "$out" -f "$base" -f "$file"; then
      log "compose config failed for $rel (see $out.err)"
    fi
    continue
  fi
  if ! render_compose "$out" -f "$file"; then
    log "compose config failed for $rel (see $out.err)"
  fi
done < "$OUT_DIR/compose-files.txt"

if [[ "$EMIT_L1_EVIDENCE" == "true" && -x "$ROOT_DIR/infra/scripts/evidence-pack-l1.sh" ]]; then
  log "Generating L1 evidence pack"
  if "$ROOT_DIR/infra/scripts/evidence-pack-l1.sh" > "$OUT_DIR/l1-evidence-pack.log" 2>&1; then
    log "L1 evidence pack: ok"
  else
    log "L1 evidence pack: failed (see $OUT_DIR/l1-evidence-pack.log)"
  fi
fi

log "Preflight complete."

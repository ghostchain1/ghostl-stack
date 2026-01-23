#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=${1:-services/docker-compose.yml}
shift || true

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" config --format json >/dev/null 2>&1; then
  echo "Failed to parse compose file: $COMPOSE_FILE" >&2
  exit 1
fi

SERVICES=$(docker compose -f "$COMPOSE_FILE" config --format json \
  | node -e "let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const cfg=JSON.parse(input);const services=cfg.services||{};const names=Object.entries(services).filter(([,svc])=>svc.build).map(([name])=>name);console.log(names.join('\n'));});")

if [ -z "$SERVICES" ]; then
  echo "No buildable services found in $COMPOSE_FILE" >&2
  exit 0
fi

echo "Building services sequentially from $COMPOSE_FILE"

for svc in $SERVICES; do
  echo "----> Building $svc"
  docker compose -f "$COMPOSE_FILE" build "$svc" "$@"
  echo "<---- Built $svc"
  echo
  sleep 1
  if docker compose -f "$COMPOSE_FILE" ps "$svc" >/dev/null 2>&1; then
    :
  fi
done

echo "All services built successfully."

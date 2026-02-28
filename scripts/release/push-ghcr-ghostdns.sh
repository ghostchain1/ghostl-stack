#!/usr/bin/env bash
set -euo pipefail

ORG="${ORG:-ghostchain1}"
REGISTRY="${REGISTRY:-ghcr.io}"
TAG="${TAG:-$(git rev-parse --short=12 HEAD)}"
PUSH_LATEST="${PUSH_LATEST:-1}"
PUSH_ENV_TAG="${PUSH_ENV_TAG:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi

if [[ -z "${GHCR_TOKEN:-}" ]]; then
  echo "GHCR_TOKEN is required (classic PAT or fine-grained token with package write)"
  exit 1
fi

if [[ -z "${GHCR_USER:-}" ]]; then
  GHCR_USER="$ORG"
fi

echo "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin

declare -a IMAGES=(
  "ghostdns-ai:services/ghostdns-ai"
  "ghostdns-indexer:services/ghostdns-indexer"
  "ghostdns-resolver:services/ghostdns-resolver"
  "ghostdns-ai-policy:services/ghostdns-ai-policy"
  "ghostdns-attestor:services/ghostdns-attestor"
  "host-orchestrator-ai:services/host-orchestrator-ai"
  "vm-protocol-ai:services/vm-protocol-ai"
  "hyper-ghost-supervisor:services/hyper-ghost-supervisor"
)

for entry in "${IMAGES[@]}"; do
  name="${entry%%:*}"
  context="${entry#*:}"
  dockerfile="$context/Dockerfile"

  if [[ ! -f "$dockerfile" ]]; then
    echo "missing Dockerfile: $dockerfile"
    exit 1
  fi

  repo="$REGISTRY/$ORG/$name"
  tags=("$repo:$TAG")
  if [[ "$PUSH_LATEST" == "1" ]]; then
    tags+=("$repo:latest")
  fi
  if [[ -n "$PUSH_ENV_TAG" ]]; then
    tags+=("$repo:$PUSH_ENV_TAG")
  fi

  echo "\n==> Building $name"
  build_args=()
  for t in "${tags[@]}"; do
    build_args+=("--tag" "$t")
  done

  docker build \
    --file "$dockerfile" \
    "${build_args[@]}" \
    "$context"

  for t in "${tags[@]}"; do
    echo "==> Pushing $t"
    docker push "$t"
  done
done

echo "\nPublished GhostDNS/HGOP images to $REGISTRY/$ORG with tag $TAG"

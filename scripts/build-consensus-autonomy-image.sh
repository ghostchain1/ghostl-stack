#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/network-manager-service"
IMAGE_NAME="${IMAGE_NAME:-ghostl/network-manager-service:local}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/ops/reports/provenance}"

VCS_REF="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$OUTPUT_DIR"

docker build \
  --build-arg VCS_REF="$VCS_REF" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  -t "$IMAGE_NAME" \
  "$SERVICE_DIR"

IMAGE_INSPECT="$(docker image inspect "$IMAGE_NAME" --format '{{json .}}')"
IMAGE_ID="$(echo "$IMAGE_INSPECT" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(d.Id)')"
IMAGE_DIGEST="$(echo "$IMAGE_INSPECT" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));const repo=(d.RepoDigests||[])[0]||"";console.log(repo)')"

PROVENANCE_PATH="$OUTPUT_DIR/network-manager-service-$(date -u +%Y%m%d-%H%M%S).json"
cat > "$PROVENANCE_PATH" <<EOF
{
  "createdAt": "$BUILD_DATE",
  "image": "$IMAGE_NAME",
  "imageId": "$IMAGE_ID",
  "imageDigest": "$IMAGE_DIGEST",
  "gitCommit": "$VCS_REF",
  "builder": "docker",
  "source": "services/network-manager-service",
  "notes": "SLSA-like provenance record; attach to release artifacts."
}
EOF

echo "Provenance written: $PROVENANCE_PATH"

#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

stamp="$(date +%Y%m%d-%H%M%S)"
out_dir="$ARTIFACT_DIR/backup-$stamp"
mkdir -p "$out_dir"

compose_cmd ps > "$out_dir/compose-ps.txt"
compose_cmd config > "$out_dir/compose.resolved.yml"

git rev-parse HEAD > "$out_dir/git-head.txt"

for f in .env.l1.testnet.example .env.l2.testnet.example .env.l3.testnet.example .env.ui.testnet.example; do
  cp "$ROOT_DIR/$f" "$out_dir/"
done

docker volume ls --format '{{.Name}}' | sort > "$out_dir/docker-volumes.txt"

tar -czf "$ARTIFACT_DIR/backup-$stamp.tgz" -C "$ARTIFACT_DIR" "backup-$stamp"

echo "[backup] created $ARTIFACT_DIR/backup-$stamp.tgz"

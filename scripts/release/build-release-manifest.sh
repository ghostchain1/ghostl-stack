#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CONSTITUTION_DOC="${CONSTITUTION_DOC:-$ROOT_DIR/docs/constitution/GhostChain-Constitution.md}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/release}"
OUT_MANIFEST="${OUT_MANIFEST:-$OUT_DIR/release_manifest.json}"
OUT_CONSTITUTION_HASH="${OUT_CONSTITUTION_HASH:-$OUT_DIR/constitution_hash.txt}"

[[ -f "$CONSTITUTION_DOC" ]] || {
  echo "missing constitution doc: $CONSTITUTION_DOC" >&2
  exit 1
}

mkdir -p "$OUT_DIR"

CONSTITUTION_HASH="$(sha256sum "$CONSTITUTION_DOC" | awk '{print $1}')"
GIT_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"
GIT_COMMIT_SHORT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

COMPOSE_FILES=(
  "$ROOT_DIR/docker-compose.yml"
  "$ROOT_DIR/docker-compose.phase3.yml"
  "$ROOT_DIR/docker-compose.sovereign.yml"
  "$ROOT_DIR/infra/ghostchain/docker-compose.l1.yml"
  "$ROOT_DIR/infra/opstack/docker-compose.yml"
  "$ROOT_DIR/infra/opstack/docker-compose.l3.yml"
)

CONFIG_FILES=(
  "$ROOT_DIR/.env.example"
  "$ROOT_DIR/stack.env.example"
  "$ROOT_DIR/services/stack.env.example"
)

COMPOSE_TMP="$(mktemp)"
CONFIG_TMP="$(mktemp)"
trap 'rm -f "$COMPOSE_TMP" "$CONFIG_TMP"' EXIT

for file in "${COMPOSE_FILES[@]}"; do
  [[ -f "$file" ]] && printf '%s\n' "$file" >>"$COMPOSE_TMP"
done
for file in "${CONFIG_FILES[@]}"; do
  [[ -f "$file" ]] && printf '%s\n' "$file" >>"$CONFIG_TMP"
done

python3 - "$ROOT_DIR" "$OUT_MANIFEST" "$CONSTITUTION_DOC" "$CONSTITUTION_HASH" "$GIT_COMMIT" "$GIT_COMMIT_SHORT" "$GENERATED_AT" "$COMPOSE_TMP" "$CONFIG_TMP" <<'PY'
import hashlib
import json
import os
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
out_manifest = pathlib.Path(sys.argv[2]).resolve()
constitution_doc = pathlib.Path(sys.argv[3]).resolve()
constitution_hash = sys.argv[4]
git_commit = sys.argv[5]
git_commit_short = sys.argv[6]
generated_at = sys.argv[7]
compose_tmp = pathlib.Path(sys.argv[8]).resolve()
config_tmp = pathlib.Path(sys.argv[9]).resolve()

def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def normalize(path: pathlib.Path) -> str:
    try:
        return str(path.relative_to(root))
    except Exception:
        return str(path)

def load_paths(tmp_file: pathlib.Path) -> list[pathlib.Path]:
    if not tmp_file.exists():
        return []
    paths: list[pathlib.Path] = []
    for line in tmp_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        p = pathlib.Path(line).resolve()
        if p.exists():
            paths.append(p)
    return sorted(paths, key=lambda p: normalize(p))

compose_hashes = {normalize(p): f"sha256:{sha256_file(p)}" for p in load_paths(compose_tmp)}
config_hashes = {normalize(p): f"sha256:{sha256_file(p)}" for p in load_paths(config_tmp)}

images_lock_path = root / "releases" / "latest" / "images.lock"
images_lock_hash = None
if images_lock_path.exists():
    images_lock_hash = f"sha256:{sha256_file(images_lock_path)}"

docker_images: list[str] = []
compose_file = root / "docker-compose.sovereign.yml"
if compose_file.exists():
    cmd = ["docker", "compose", "-f", str(compose_file), "config", "--images"]
    try:
        proc = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        docker_images = sorted({line.strip() for line in proc.stdout.splitlines() if line.strip()})
    except Exception:
        docker_images = []

manifest = {
    "version": "ghost-release-manifest/v1",
    "generated_at": generated_at,
    "git_commit": git_commit,
    "git_commit_short": git_commit_short,
    "constitution": {
        "path": normalize(constitution_doc),
        "hash": f"sha256:{constitution_hash}",
    },
    "compose_hashes": compose_hashes,
    "config_hashes": config_hashes,
    "images_lock_hash": images_lock_hash,
    "docker_images": docker_images,
}

out_manifest.parent.mkdir(parents=True, exist_ok=True)
out_manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

printf 'sha256:%s\n' "$CONSTITUTION_HASH" >"$OUT_CONSTITUTION_HASH"
echo "release_manifest_built:$OUT_MANIFEST"

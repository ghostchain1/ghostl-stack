#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing_command:$1"
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || die "not_in_git_repo"
}

script_dir() {
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd
}

hashutil_py() {
  echo "$(script_dir)/hashutil.py"
}

keccak256_file() {
  python3 "$(hashutil_py)" keccak256-file "$1" --0x
}

keccak256_str() {
  python3 "$(hashutil_py)" keccak256-str "$1" --0x
}

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}


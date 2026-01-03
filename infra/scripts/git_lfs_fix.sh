#!/usr/bin/env bash
set -euo pipefail

if command -v git-lfs >/dev/null 2>&1; then
  echo "git-lfs already installed: $(git lfs version)"
else
  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing git-lfs via apt..."
    sudo apt-get update
    sudo apt-get install -y git-lfs
  elif command -v apk >/dev/null 2>&1; then
    echo "Installing git-lfs via apk..."
    sudo apk add --no-cache git-lfs
  else
    echo "git-lfs not found, and no supported package manager detected." >&2
    echo "Install git-lfs, or delete .git/hooks/pre-push if you don't use LFS." >&2
    exit 1
  fi
fi

git lfs install --local
echo "OK"

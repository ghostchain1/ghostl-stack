#!/usr/bin/env bash
set -euo pipefail

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform not installed; skipping plan."
  exit 0
fi

for dir in infra/terraform/gke infra/terraform/eks; do
  echo "Planning in $dir"
  terraform -chdir="$dir" init -backend=false -input=false
  terraform -chdir="$dir" plan -lock=false -input=false
  echo ""
done

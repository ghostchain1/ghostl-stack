#!/usr/bin/env bash
set -euo pipefail

if ! command -v helm >/dev/null 2>&1; then
  echo "helm not installed; skipping template."
  exit 0
fi

for chart in infra/helm/ghostchain-core infra/helm/ghostchain-services infra/helm/ghostchain-ui infra/helm/ghostchain-observability; do
  echo "Rendering $chart"
  helm template "$chart" >/tmp/helm-template-$(basename "$chart").yaml
  echo ""
done

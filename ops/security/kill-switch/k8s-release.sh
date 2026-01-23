#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="default"
SELECTOR=""

usage() {
  cat <<'USAGE'
Usage: k8s-release.sh --namespace <ns> [--selector <label>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace) NAMESPACE="$2"; shift 2;;
    --selector) SELECTOR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required for Kubernetes release." >&2
  exit 1
fi

if [[ -n "$SELECTOR" ]]; then
  kubectl -n "$NAMESPACE" label deployment -l "$SELECTOR" ghostchain.freeze- --overwrite
else
  kubectl -n "$NAMESPACE" label deployment --all ghostchain.freeze- --overwrite
fi

echo "Kubernetes freeze labels removed for namespace $NAMESPACE"

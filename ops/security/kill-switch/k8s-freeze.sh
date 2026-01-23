#!/usr/bin/env bash
set -Eeuo pipefail

NAMESPACE="default"
SELECTOR=""
SCALE_SELECTOR=""

usage() {
  cat <<'USAGE'
Usage: k8s-freeze.sh --namespace <ns> [--selector <label>] [--scale-selector <label>]

--selector: label selector for resources to mark as frozen (default: all deployments)
--scale-selector: label selector for non-chain stateless workloads to scale to zero
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace) NAMESPACE="$2"; shift 2;;
    --selector) SELECTOR="$2"; shift 2;;
    --scale-selector) SCALE_SELECTOR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required for Kubernetes freeze." >&2
  exit 1
fi

if [[ -n "$SCALE_SELECTOR" ]]; then
  kubectl -n "$NAMESPACE" scale deployment -l "$SCALE_SELECTOR" --replicas=0
fi

if [[ -n "$SELECTOR" ]]; then
  kubectl -n "$NAMESPACE" label deployment -l "$SELECTOR" ghostchain.freeze=active --overwrite
else
  kubectl -n "$NAMESPACE" label deployment --all ghostchain.freeze=active --overwrite
fi

echo "Kubernetes freeze applied to namespace $NAMESPACE"

#!/usr/bin/env bash
# LitVybzLive — Service Scaling
# Usage: bash devops/scripts/scale.sh <service> <replicas> [--k8s]
#
# Examples:
#   bash devops/scripts/scale.sh api-gateway 5
#   bash devops/scripts/scale.sh chat-service 4 --k8s
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../compose/docker-compose.full.yml"
NS="litvyblive"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Stream services that use hostNetwork (DaemonSet — cannot be scaled via replica count)
HOST_NET_SVCS=("mediasoup-server" "edge-node-us-east" "edge-node-eu-west" "edge-node-asia")

SVC="${1:?Usage: scale.sh <service> <replicas> [--k8s]}"
REPLICAS="${2:?Usage: scale.sh <service> <replicas> [--k8s]}"
MODE="${3:-}"

[[ "${REPLICAS}" =~ ^[0-9]+$ ]]     || die "replicas must be a positive integer"
[[ "${REPLICAS}" -ge 1 ]]           || die "replicas must be >= 1"
[[ "${REPLICAS}" -le 50 ]]          || die "replicas > 50 requires manual override — too risky"

# Guard DaemonSet services
for hn in "${HOST_NET_SVCS[@]}"; do
  [[ "${SVC}" == "${hn}" ]] && die "${SVC} uses hostNetwork (DaemonSet) — scale by adding nodes instead"
done

if [[ "${MODE}" == "--k8s" ]]; then
  command -v kubectl &>/dev/null || die "kubectl not found"
  info "Scaling ${SVC} to ${REPLICAS} replica(s) in Kubernetes namespace ${NS} …"
  kubectl scale deployment "${SVC}" --replicas="${REPLICAS}" -n "${NS}"
  ok "Scaled: $(kubectl rollout status deployment/${SVC} -n ${NS})"
else
  [[ -f "${COMPOSE_FILE}" ]] || die "Compose file not found: ${COMPOSE_FILE}"
  info "Scaling ${SVC} to ${REPLICAS} replica(s) via Docker Compose …"
  docker compose -f "${COMPOSE_FILE}" up -d --scale "${SVC}=${REPLICAS}" --no-recreate "${SVC}"
  ok "${SVC} → ${REPLICAS} replica(s)"
  docker compose -f "${COMPOSE_FILE}" ps "${SVC}"
fi

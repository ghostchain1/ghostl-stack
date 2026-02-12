#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/liquidity-gravity/docker-compose.yml"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose

echo "[LGE][CHAOS] Safety: this script does NOT delete volumes or reset chains."

echo "[LGE][CHAOS] 1) External RPC outage simulation (stop external-evm for 20s)"
hg_docker compose -f "${COMPOSE_FILE}" stop external-evm
sleep 20
hg_docker compose -f "${COMPOSE_FILE}" start external-evm

echo "[LGE][CHAOS] 2) Router health after outage"
curl -fsS "http://localhost:7607/health" || true

echo "[LGE][CHAOS] 3) Metrics snapshot"
curl -fsS "http://localhost:7607/metrics" | rg -n "lge_policy_violations_total|policy_violations_total|lge_breaker_state|breaker_state" || true

echo "[LGE][CHAOS] Done. For missed-settlement chaos, configure a short adapter settlement interval and disable relayer quorum, then observe breaker pause via SettlementOracle.enforceSettlementWindow()."

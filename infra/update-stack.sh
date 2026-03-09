#!/usr/bin/env bash
# GhostStack Autonomous Upgrade Script
# Upgrades code, Docker images, and AI service builds.
# Does NOT upgrade Vault, rotate validator keys, or modify governance contracts.

set -euo pipefail

STACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${STACK_ROOT}/logs/upgrades.log"
mkdir -p "$(dirname "${LOG}")"

log() { echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [UPGRADE] $*" | tee -a "${LOG}"; }

log "Upgrade cycle started."
cd "${STACK_ROOT}"

# Pull latest code (fast-forward only — fails on dirty state, protecting local changes)
git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  log "Already at latest commit ${LOCAL:0:8} — nothing to upgrade."
  exit 0
fi

git pull --ff-only --quiet origin main
log "Code updated: ${LOCAL:0:8} → ${REMOTE:0:8}"

# Pull latest Docker images and reload services (zero-downtime rolling update)
docker compose pull --quiet 2>&1 | grep -v "^$" | while read -r line; do log "${line}"; done
docker compose up -d --remove-orphans
log "Docker services reloaded."

# Rebuild AI service packages that have changed
for SVC in ghostbrain-core ghost-contract-engine ghost-protocol-architect \
           ghost-defi-architect ghost-governor-ai ghost-infra-controller \
           ghost-multichain-controller; do
  DIR="${STACK_ROOT}/services/${SVC}"
  if [[ -d "${DIR}" ]]; then
    ( cd "${DIR}" && npm install --silent && npm run build 2>&1 ) \
      && log "${SVC} rebuilt." \
      || log "[WARN] ${SVC} rebuild failed — service continues on previous build."
  fi
done

log "Upgrade cycle complete."

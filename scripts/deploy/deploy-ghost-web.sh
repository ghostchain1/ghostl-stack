#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GhostChain — Deploy full web stack to ghost-web VM (208.110.71.171)
#
# Builds all ghostchain/web-* images, streams them to ghost-web via SSH pipe,
# uploads docker-compose.web.yml and the canonical Caddyfile, starts all
# 17 web services, and reloads Caddy.
#
# Usage (run from /home/ghost/ghostl-stack):
#   bash scripts/deploy/deploy-ghost-web.sh            # full deploy
#   bash scripts/deploy/deploy-ghost-web.sh --build    # build images first
#   bash scripts/deploy/deploy-ghost-web.sh --caddy    # Caddyfile + reload only
#   bash scripts/deploy/deploy-ghost-web.sh --dry-run  # show steps only
#
# Requires:
#   - ssh access to 208.110.71.171 via hypervisor (ssh hypervisor 'ssh ghost@...')
#   - docker running on devnet (build host)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GHOST_WEB="208.110.71.171"
GHOST_WEB_USER="ghost"
HYPERVISOR="hypervisor"
CADDY_CONTAINER="ghostchain-caddy"
CADDY_FILE="/home/ghost/ghostchain-web/Caddyfile"
DRY_RUN=false
BUILD_ONLY=false
CADDY_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --build)   BUILD_ONLY=true ;;
    --caddy)   CADDY_ONLY=true ;;
  esac
done

log()  { echo "[deploy-web] $(date '+%H:%M:%S') $*"; }
run()  { if "$DRY_RUN"; then echo "[DRY-RUN] $*"; else "$@"; fi; }
# Run a command on ghost-web via hypervisor jump
rweb() { ssh "$HYPERVISOR" "ssh ${GHOST_WEB_USER}@${GHOST_WEB} \"$*\"" 2>&1; }

log "=== GhostChain Web Stack → ghost-web deployment ==="
log "Target: ${GHOST_WEB_USER}@${GHOST_WEB} via ${HYPERVISOR}"
$DRY_RUN && log "DRY-RUN mode enabled — no writes."

# ─────────────────────────────────────────────────────────────────────────────
# All 17 ghostchain web images (built from /home/ghost/ghostl-stack)
# ─────────────────────────────────────────────────────────────────────────────
ALL_IMAGES=(
  ghostchain/web-main:latest
  ghostchain/web-investor:latest
  ghostchain/web-dev:latest
  ghostchain/web-apps:latest
  ghostchain/web-explorer:latest
  ghostchain/web-governance:latest
  ghostchain/web-nodes:latest
  ghostchain/web-exchange:latest
  ghostchain/web-company:latest
  ghostchain/web-status:latest
  ghostchain/web-portal:latest
  ghostchain/web-wallet:latest
  ghostchain/web-bridge:latest
  ghostchain/web-docs:latest
  ghostchain/web-live:latest
  ghostchain/web-ai:latest
  ghostchain/web-rpc-portal:latest
)

ALL_SERVICES=(
  web-main web-investor web-dev web-apps web-explorer
  web-governance web-nodes web-exchange web-company web-status
  web-portal web-wallet web-bridge web-docs web-live web-ai web-rpc-portal
)

# ─────────────────────────────────────────────────────────────────────────────
# --caddy only: push Caddyfile and reload
# ─────────────────────────────────────────────────────────────────────────────
if "$CADDY_ONLY"; then
  log "[caddy] Pushing Caddyfile and reloading..."
  scp scripts/deploy/Caddyfile.ghostchain.cloud "$HYPERVISOR:/tmp/Caddyfile.ghostchain"
  ssh "$HYPERVISOR" "scp /tmp/Caddyfile.ghostchain ${GHOST_WEB_USER}@${GHOST_WEB}:${CADDY_FILE}"
  rweb "docker exec ${CADDY_CONTAINER} caddy validate --config ${CADDY_FILE} 2>&1 | tail -3"
  rweb "docker exec ${CADDY_CONTAINER} caddy reload --config ${CADDY_FILE} 2>&1 | tail -3"
  log "Caddy reloaded."
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# --build: build all images on devnet first
# ─────────────────────────────────────────────────────────────────────────────
if "$BUILD_ONLY" || [[ "${1:-}" == "--build" ]]; then
  log "[0] Building all web images..."
  run docker compose -f docker-compose.web.yml build "${ALL_SERVICES[@]}"
  log "Build complete."
fi

# ── Step 1: Upload docker-compose.web.yml ────────────────────────────────────
log "[1/4] Uploading docker-compose.web.yml..."
scp docker-compose.web.yml "$HYPERVISOR:/tmp/docker-compose.web.yml"
ssh "$HYPERVISOR" "scp /tmp/docker-compose.web.yml ${GHOST_WEB_USER}@${GHOST_WEB}:/home/ghost/docker-compose.web.yml"
log "  ✓ Compose file uploaded."

# ── Step 2: Stream images ─────────────────────────────────────────────────────
log "[2/4] Streaming Docker images to ghost-web..."
log "  Images: ${ALL_IMAGES[*]}"

# Only stream images that exist locally
PRESENT=()
for img in "${ALL_IMAGES[@]}"; do
  docker image inspect "$img" &>/dev/null && PRESENT+=("$img") || log "  ⚠ skipping $img (not built yet)"
done

if (( ${#PRESENT[@]} > 0 )); then
  if ! $DRY_RUN; then
    docker save "${PRESENT[@]}" | \
      ssh "$HYPERVISOR" "ssh ${GHOST_WEB_USER}@${GHOST_WEB} 'docker load'"
    log "  ✓ ${#PRESENT[@]} images transferred."
  else
    echo "[DRY-RUN] docker save ${PRESENT[*]} | ssh … docker load"
  fi
fi

# ── Step 3: Connect Caddy to ghostweb network (idempotent) ───────────────────
log "[3/4] Ensuring Caddy is on ghostweb network..."
rweb "docker network connect ghostweb ${CADDY_CONTAINER} 2>/dev/null | true; echo ok" || true

# ── Step 4: Start / recreate containers ──────────────────────────────────────
log "[4/4] Starting web services on ghost-web..."

# Determine which services have images on the remote
READY_SERVICES=()
for svc in "${ALL_SERVICES[@]}"; do
  img="ghostchain/${svc}:latest"
  rweb "docker image inspect ${img} &>/dev/null && echo yes || echo no" 2>/dev/null | grep -q yes \
    && READY_SERVICES+=("$svc") || log "  ⚠ ${svc}: image missing on ghost-web, skipping"
done

if (( ${#READY_SERVICES[@]} > 0 )); then
  run rweb "cd /home/ghost && docker compose -f docker-compose.web.yml up -d --no-build ${READY_SERVICES[*]} 2>&1 | tail -20"
  log "  ✓ Started: ${READY_SERVICES[*]}"
fi

# ── Step 5: Push & reload Caddyfile ──────────────────────────────────────────
log "[5/5] Deploying Caddyfile..."
CADDYFILE_SRC="scripts/deploy/Caddyfile.ghostchain.cloud"
if [[ -f "$CADDYFILE_SRC" ]]; then
  scp "$CADDYFILE_SRC" "$HYPERVISOR:/tmp/Caddyfile.ghostchain"
  ssh "$HYPERVISOR" "scp /tmp/Caddyfile.ghostchain ${GHOST_WEB_USER}@${GHOST_WEB}:${CADDY_FILE}"
  rweb "docker exec ${CADDY_CONTAINER} caddy validate --config ${CADDY_FILE} 2>&1 | grep -E 'Valid|error'"
  run rweb "docker exec ${CADDY_CONTAINER} caddy reload --config ${CADDY_FILE} 2>&1 | tail -2"
  log "  ✓ Caddyfile deployed and reloaded."
fi

log ""
log "=== Deployment complete ==="
log "Running on ghost-web (208.110.71.171):"
log "  ghostchain.cloud         → ghostchain-web (nginx)"
log "  investor/invest.*        → :3011  web-investor"
log "  dev.*                    → :3012  web-dev"
log "  apps/app.*               → :3013  web-apps"
log "  explorer.*               → :3014  web-explorer"
log "  governance.*             → :3015  web-governance"
log "  nodes/validator.*        → :3016  web-nodes"
log "  exchange.*               → :3017  web-exchange"
log "  company/employee.*       → :3018  web-company"
log "  status.*                 → :3019  web-status"
log "  portal/admin.*           → :3020  web-portal"
log "  wallet.*                 → :3021  web-wallet"
log "  bridge.*                 → :3022  web-bridge"
log "  docs.*                   → :3023  web-docs"
log "  live.*                   → :3024  web-live"
log "  ai.*                     → :3025  web-ai"
log "  api.*                    → :4000  (devnet api)"
log "  rpc.*                    → :18545 (L1 JSON-RPC)"
log ""
log "Verify: curl -sI https://ghostchain.cloud | head -5"

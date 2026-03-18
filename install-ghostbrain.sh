#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GhostBrain Genesis Installer
#
# Bootstraps the complete GhostBrain AI stack inside the GhostStack environment.
# Idempotent — safe to run more than once: every step checks before acting.
#
# Phases:
#   1  Preflight checks (OS, user, paths)
#   2  System package dependencies
#   3  Node.js 22 (via NodeSource)
#   4  Database services  (Redis · PostgreSQL · Qdrant via Docker)
#   5  Database schema migration  (001 → 004)
#   6  GhostBrain Core build  (npm install + tsc)
#   7  Environment file  (.env for ghostbrain-core)
#   8  Libvirt / Docker access grants
#   9  Systemd unit (production) or PM2 fallback (dev)
#  10  Smoke test + status summary
#
# Usage:
#   cd /home/ghost/ghostl-stack
#   bash install-ghostbrain.sh [--dry-run] [--skip-node] [--no-systemd]
#
# Options:
#   --dry-run     Print every action without executing it
#   --skip-node   Assume Node.js 22 is already installed
#   --no-systemd  Skip systemd unit (use PM2 ecosystem.config.cjs instead)
#
# Required env vars (set before running, or the script will prompt):
#   GHOSTBRAIN_DB_PASSWORD   PostgreSQL password for the ghostbrain user
#   GHOSTBRAIN_AUDIT_KEY     HMAC key (≥32 bytes) for the audit log
#
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[1;34m'
BOLD='\033[1m'
RST='\033[0m'

info()  { echo -e "${BLU}[ghostbrain]${RST} $*"; }
ok()    { echo -e "${GRN}[✓]${RST} $*"; }
warn()  { echo -e "${YLW}[!]${RST} $*"; }
die()   { echo -e "${RED}[✗]${RST} $*" >&2; exit 1; }
header(){ echo -e "\n${BOLD}${BLU}── $* ────────────────────────────────${RST}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────
DRY_RUN=0
SKIP_NODE=0
NO_SYSTEMD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-node)  SKIP_NODE=1 ;;
    --no-systemd) NO_SYSTEMD=1 ;;
    -h|--help)
      sed -n '/^# Usage/,/^# ─/p' "$0" | head -n 20
      exit 0
      ;;
    *) warn "Unknown option: $arg (ignored)" ;;
  esac
done

# ── Dry-run wrapper ───────────────────────────────────────────────────────────
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${YLW}DRY-RUN:${RST} $*"
  else
    "$@"
  fi
}

# ── Paths ─────────────────────────────────────────────────────────────────────
STACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GB_DIR="$STACK_ROOT/services/ghostbrain-core"
DB_MIGRATIONS="$GB_DIR/database/migrations"
ENV_FILE="$GB_DIR/.env"
SYSTEMD_UNIT="/etc/systemd/system/ghostbrain-core.service"
LOG_DIR="/var/log/ghostbrain"
RUN_DIR="/var/run/ghostbrain"

echo -e "\n${BOLD}${BLU}🧠  GhostBrain Genesis Installer${RST}"
echo    "    Stack root : $STACK_ROOT"
echo    "    Service dir: $GB_DIR"
[[ "$DRY_RUN" -eq 1 ]] && warn "DRY-RUN mode — no changes will be made"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Preflight
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 1 — Preflight"

[[ -d "$GB_DIR" ]]          || die "ghostbrain-core source not found at $GB_DIR"
[[ -f "$GB_DIR/package.json" ]] || die "Missing package.json — is ghostbrain-core checked out?"
[[ -d "$DB_MIGRATIONS" ]]   || die "Missing database/migrations — repository incomplete"

# Require running as a non-root user that can sudo
if [[ "$EUID" -eq 0 ]]; then
  die "Run as the 'ghost' user (with sudo), not as root directly."
fi
command -v sudo >/dev/null 2>&1 || die "sudo not found — install it first"

# Prompt for secrets if not already in env
if [[ -z "${GHOSTBRAIN_DB_PASSWORD:-}" ]]; then
  read -r -s -p "Set PostgreSQL password for ghostbrain DB user: " GHOSTBRAIN_DB_PASSWORD
  echo
fi
if [[ -z "${GHOSTBRAIN_DB_PASSWORD:-}" ]]; then
  die "GHOSTBRAIN_DB_PASSWORD must not be empty"
fi

if [[ -z "${GHOSTBRAIN_AUDIT_KEY:-}" ]]; then
  # Auto-generate a 48-byte key if not supplied
  GHOSTBRAIN_AUDIT_KEY="$(openssl rand -hex 48 2>/dev/null || head -c 96 /dev/urandom | xxd -p | tr -d '\n')"
  warn "GHOSTBRAIN_AUDIT_KEY not set — generated random key (saved to .env)"
fi

ok "Preflight passed"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — System packages
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 2 — System packages"

PKGS=(
  curl wget jq openssl ca-certificates gnupg lsb-release
  libvirt-clients libvirt-daemon-system qemu-kvm
  postgresql-client   # psql CLI for migration runner (server runs in Docker)
)

# Check which packages are missing before running apt
MISSING=()
for pkg in "${PKGS[@]}"; do
  dpkg -s "$pkg" &>/dev/null || MISSING+=("$pkg")
done

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  info "Installing: ${MISSING[*]}"
  run sudo apt-get update -qq
  run sudo apt-get install -y -qq "${MISSING[@]}"
else
  ok "All system packages already installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — Node.js 22
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 3 — Node.js 22"

if [[ "$SKIP_NODE" -eq 1 ]]; then
  info "Skipping Node.js install (--skip-node)"
else
  NEED_NODE=1
  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node --version | sed 's/v\([0-9]*\).*/\1/')"
    if [[ "$NODE_MAJOR" -ge 22 ]]; then
      ok "Node.js $(node --version) already installed"
      NEED_NODE=0
    else
      warn "Found Node.js v$NODE_MAJOR — need ≥22; will upgrade via NodeSource"
    fi
  fi

  if [[ "$NEED_NODE" -eq 1 ]]; then
    info "Installing Node.js 22 via NodeSource"
    # Download to a temp file, verify it's a shell script, then execute
    TMPFILE="$(mktemp /tmp/nodesource-XXXXXX.sh)"
    run curl -fsSL "https://deb.nodesource.com/setup_22.x" -o "$TMPFILE"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      # Basic sanity check — the script must contain the nodesource fingerprint
      grep -q "nodesource" "$TMPFILE" || die "NodeSource setup script looks wrong — aborting"
      sudo -E bash "$TMPFILE"
      rm -f "$TMPFILE"
      sudo apt-get install -y -qq nodejs
    fi
    ok "Node.js 22 installed: $(node --version 2>/dev/null || echo 'pending')"
  fi
fi

# Enforce the repo's Node engine constraint (≥22.21.0 <23)
if [[ "$DRY_RUN" -eq 0 ]]; then
  NODE_MAJOR="$(node --version | sed 's/v\([0-9]*\).*/\1/')"
  if [[ "$NODE_MAJOR" -ne 22 ]]; then
    die "Node.js 22 required (found $(node --version))"
  fi
  # npm itself
  if ! command -v npm &>/dev/null; then
    die "npm not found after Node.js install"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Database services (Docker Compose)
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 4 — Database services"

# Docker must already be installed (it's part of GhostStack's docker-compose.yml)
command -v docker >/dev/null 2>&1 || die "Docker not found — install Docker Engine first (see GhostStack docs)"
if ! docker compose version >/dev/null 2>&1; then
  die "docker compose plugin not found — upgrade Docker Engine"
fi

DB_COMPOSE="$GB_DIR/docker/ghostbrain-databases.yml"

# Write the database compose file only if it doesn't already exist
if [[ ! -f "$DB_COMPOSE" ]]; then
  info "Writing $DB_COMPOSE"
  [[ "$DRY_RUN" -eq 0 ]] && cat > "$DB_COMPOSE" << COMPOSE
# GhostBrain Core — Neural Memory Database Stack
# Managed by install-ghostbrain.sh — do not edit manually.
# Start: docker compose -f ghostbrain-databases.yml up -d
# Stop:  docker compose -f ghostbrain-databases.yml down

services:

  ghostbrain-redis:
    image: redis:7-alpine
    container_name: ghostbrain-redis
    restart: unless-stopped
    command: >
      redis-server
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --save ""
    networks: [ghostbrain-db]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  ghostbrain-postgres:
    image: postgres:16-alpine
    container_name: ghostbrain-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ghostbrain
      POSTGRES_USER: ghostbrain
      POSTGRES_PASSWORD: "${GHOSTBRAIN_DB_PASSWORD}"
    volumes:
      - ghostbrain-pgdata:/var/lib/postgresql/data
    networks: [ghostbrain-db]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ghostbrain -d ghostbrain"]
      interval: 10s
      timeout: 5s
      retries: 10

  ghostbrain-qdrant:
    image: qdrant/qdrant:v1.9.2
    container_name: ghostbrain-qdrant
    restart: unless-stopped
    volumes:
      - ghostbrain-qdrant:/qdrant/storage
    networks: [ghostbrain-db]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/healthz"]
      interval: 15s
      timeout: 5s
      retries: 5

volumes:
  ghostbrain-pgdata:
  ghostbrain-qdrant:

networks:
  ghostbrain-db:
    name: ghostbrain-db
COMPOSE
else
  ok "$DB_COMPOSE already exists — skipping overwrite"
fi

info "Bringing database services up (detached)"
run docker compose -f "$DB_COMPOSE" up -d --remove-orphans

# Wait for PostgreSQL to be healthy (max 60 s)
if [[ "$DRY_RUN" -eq 0 ]]; then
  info "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    if docker exec ghostbrain-postgres pg_isready -U ghostbrain -d ghostbrain -q 2>/dev/null; then
      ok "PostgreSQL ready"
      break
    fi
    sleep 2
    if [[ "$i" -eq 30 ]]; then
      die "PostgreSQL did not become healthy after 60 s — check: docker logs ghostbrain-postgres"
    fi
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 5 — Database schema migrations
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 5 — Database migrations"

# Build the DSN from the compose values
DB_URL="postgresql://ghostbrain:${GHOSTBRAIN_DB_PASSWORD}@localhost:5432/ghostbrain"

run_migration() {
  local sql_file="$1"
  local name
  name="$(basename "$sql_file")"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo -e "  ${YLW}DRY-RUN:${RST} psql $DB_URL -f $sql_file"
    return
  fi
  info "Applying migration: $name"
  # Port-forward: run psql inside the container to avoid host client version mismatch
  docker exec -i ghostbrain-postgres \
    psql "postgresql://ghostbrain:${GHOSTBRAIN_DB_PASSWORD}@localhost/ghostbrain" \
    < "$sql_file"
  if [[ $? -eq 0 ]]; then
    ok "$name applied"
  else
    die "Migration $name failed — check the output above"
  fi
}

# Apply migrations in order
for migration in "$DB_MIGRATIONS"/0*.sql; do
  run_migration "$migration"
done

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 6 — GhostBrain Core build
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 6 — GhostBrain Core build"

cd "$GB_DIR"

info "Installing npm dependencies"
run npm install --prefer-offline 2>&1 | grep -E "^(added|updated|npm warn|ERR)" || true

info "Building TypeScript (tsc)"
run npm run build

ok "Build complete — dist/ ready"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 7 — Environment file
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 7 — Environment file"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists at $ENV_FILE — skipping (edit manually if needed)"
else
  info "Writing .env to $ENV_FILE"
  [[ "$DRY_RUN" -eq 0 ]] && cat > "$ENV_FILE" << ENV
# GhostBrain Core — Runtime Environment
# Generated by install-ghostbrain.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ─────────────────────────────────────────────────────────────────────────────

# ── Service ───────────────────────────────────────────────────────────────────
NODE_ENV=production
GHOSTBRAIN_PORT=7900
GHOSTBRAIN_BIND=127.0.0.1
LOG_LEVEL=info

# ── Chain IDs ─────────────────────────────────────────────────────────────────
GHOSTAI_L1_CHAIN_ID=14000101
GHOSTAI_L2_CHAIN_ID=901
GHOSTAI_L3_CHAIN_ID=903

# ── Chain RPC endpoints ───────────────────────────────────────────────────────
GHOST_L1_RPC_URLS=http://127.0.0.1:18545
GHOST_L2_RPC_URLS=http://127.0.0.1:29547
GHOST_L3_RPC_URLS=http://127.0.0.1:39545

# ── Neural Memory — PostgreSQL ────────────────────────────────────────────────
GHOSTBRAIN_DB_URL=postgresql://ghostbrain:${GHOSTBRAIN_DB_PASSWORD}@127.0.0.1:5432/ghostbrain

# ── Neural Memory — Redis ─────────────────────────────────────────────────────
GHOSTBRAIN_REDIS_URL=redis://127.0.0.1:6379

# ── Neural Memory — Qdrant ────────────────────────────────────────────────────
GHOSTBRAIN_QDRANT_URL=http://127.0.0.1:6333
GHOSTBRAIN_QDRANT_KEY=

# ── Audit log HMAC key (tamper-proof AI decision log) ────────────────────────
GHOSTBRAIN_AUDIT_HMAC_KEY=${GHOSTBRAIN_AUDIT_KEY}

# ── AI Kernel — safety settings ──────────────────────────────────────────────
# Set KERNEL_DRY_RUN=1 in staging to prevent real infrastructure mutations
KERNEL_DRY_RUN=0
KERNEL_RATE_WINDOW_MS=60000
KERNEL_RATE_MAX=5
# Comma-separated container/VM names the kernel is allowed to actuate.
# Leave blank to allow ANY target (still blocked by protected-pattern list).
KERNEL_TARGET_ALLOWLIST=

# ── Docker / libvirt ──────────────────────────────────────────────────────────
DOCKER_SOCKET=unix:///var/run/docker.sock
LIBVIRT_REST_URL=

# ── HyperCore (Layer 5) ───────────────────────────────────────────────────────
HYPERCORE_LOOP_MS=15000
HYPERCORE_EVOLVE_EVERY_N=20
HYPERCORE_DRY_RUN=0

# ── Governance / signing relay ────────────────────────────────────────────────
SIGNING_RELAY_URL=http://127.0.0.1:7910
CONTROL_PLANE_HMAC_SECRET=change_me_to_64_byte_random_secret

# ── Observability ─────────────────────────────────────────────────────────────
PROMETHEUS_PUSHGATEWAY_URL=http://127.0.0.1:9091
REPORT_INTERVAL_MS=15000

# ── Repair safety ─────────────────────────────────────────────────────────────
REPAIR_DRY_RUN=0
REPAIR_MAX_PER_HOUR=4

# ── Cluster mesh (optional — leave blank for single-node) ────────────────────
CLUSTER_URL=
CLUSTER_PEERS=
ENV

  # Lock down permissions — .env contains secrets
  if [[ "$DRY_RUN" -eq 0 ]]; then
    chmod 600 "$ENV_FILE"
    ok ".env written (permissions 600)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 8 — Docker + libvirt access
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 8 — Docker + libvirt access"

CURRENT_USER="$(id -un)"

# Docker group membership
if groups "$CURRENT_USER" | grep -q '\bdocker\b'; then
  ok "$CURRENT_USER is already in the docker group"
else
  info "Adding $CURRENT_USER to docker group"
  run sudo usermod -aG docker "$CURRENT_USER"
  warn "Group change takes effect in a new shell session (or run: newgrp docker)"
fi

# libvirt group membership
if groups "$CURRENT_USER" | grep -q '\blibvirt\b'; then
  ok "$CURRENT_USER is already in the libvirt group"
else
  if getent group libvirt >/dev/null 2>&1; then
    info "Adding $CURRENT_USER to libvirt group"
    run sudo usermod -aG libvirt "$CURRENT_USER"
  else
    warn "libvirt group not found — VM control will use REST bridge only (set LIBVIRT_REST_URL)"
  fi
fi

# Runtime directories
for dir in "$LOG_DIR" "$RUN_DIR"; do
  if [[ ! -d "$dir" ]]; then
    info "Creating $dir"
    run sudo mkdir -p "$dir"
    run sudo chown "$CURRENT_USER:$CURRENT_USER" "$dir"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 9 — Service registration
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 9 — Service registration"

if [[ "$NO_SYSTEMD" -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then

  if [[ -f "$SYSTEMD_UNIT" ]]; then
    warn "systemd unit already exists at $SYSTEMD_UNIT — skipping overwrite"
  else
    info "Writing systemd unit to $SYSTEMD_UNIT"
    [[ "$DRY_RUN" -eq 0 ]] && sudo tee "$SYSTEMD_UNIT" > /dev/null << UNIT
[Unit]
Description=GhostBrain Core — Autonomous AI Infrastructure OS (Layer 6)
Documentation=https://github.com/ghostchain1/ghostl-stack
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${GB_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=$(command -v node) ${GB_DIR}/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ghostbrain-core

# Harden the service — restrict what the process can do
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${GB_DIR} ${LOG_DIR} ${RUN_DIR}
# Allow access to Docker socket and /proc (needed by kernel layer)
SupplementaryGroups=docker

[Install]
WantedBy=multi-user.target
UNIT

    run sudo systemctl daemon-reload
    run sudo systemctl enable ghostbrain-core.service
    info "systemd unit enabled (not started yet — see Phase 10)"
    ok "ghostbrain-core.service registered"
  fi

else
  # PM2 fallback for environments without systemd (or --no-systemd)
  info "Registering with PM2 (systemd unavailable or skipped)"
  if command -v pm2 >/dev/null 2>&1; then
    run pm2 start "$STACK_ROOT/ecosystem.config.cjs" --only ghostbrain-core
    run pm2 save
    ok "PM2 process registered"
  else
    warn "PM2 not found — start GhostBrain manually:"
    warn "  cd $GB_DIR && node dist/index.js"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 10 — Smoke test + status
# ─────────────────────────────────────────────────────────────────────────────
header "Phase 10 — Smoke test"

if [[ "$DRY_RUN" -eq 0 ]]; then
  # Start the service (systemd path)
  if command -v systemctl >/dev/null 2>&1 && [[ "$NO_SYSTEMD" -eq 0 ]]; then
    if ! systemctl is-active --quiet ghostbrain-core.service 2>/dev/null; then
      info "Starting ghostbrain-core.service"
      run sudo systemctl start ghostbrain-core.service
      sleep 4
    fi
  fi

  # Health-check the HTTP API (give the service up to 20 s to bind)
  info "Waiting for GhostBrain API on :7900 ..."
  HEALTHY=0
  for i in $(seq 1 10); do
    if curl -sfS "http://127.0.0.1:7900/healthz" -o /dev/null 2>/dev/null; then
      HEALTHY=1
      break
    fi
    sleep 2
  done

  if [[ "$HEALTHY" -eq 1 ]]; then
    ok "GhostBrain API is responding on http://127.0.0.1:7900"
    BRAIN_STATUS="$(curl -sf http://127.0.0.1:7900/api/v1/kernel/status 2>/dev/null || echo '{}')"
    echo    ""
    echo -e "  ${BOLD}Kernel status:${RST} $BRAIN_STATUS" | head -c 320
    echo    ""
    KERNEL_STAT="$(curl -sf http://127.0.0.1:7900/kernel/engine/status 2>/dev/null || echo '{}')"
    echo -e "  ${BOLD}AI Kernel (L6):${RST} $KERNEL_STAT" | head -c 320
    echo    ""
  else
    warn "GhostBrain did not respond on :7900 within 20 s"
    warn "Check: journalctl -u ghostbrain-core.service -n 40 --no-pager"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GRN}🧠  GhostBrain Genesis Install Complete${RST}"
echo ""
echo "  Stack root     : $STACK_ROOT"
echo "  Service        : $GB_DIR"
echo "  Environment    : $ENV_FILE"
echo "  Log dir        : $LOG_DIR"
echo "  Systemd unit   : $SYSTEMD_UNIT"
echo ""
echo "  Databases (Docker):"
echo "    Redis        : 127.0.0.1:6379"
echo "    PostgreSQL   : 127.0.0.1:5432  db=ghostbrain"
echo "    Qdrant       : 127.0.0.1:6333"
echo ""
echo "  GhostBrain API  : http://127.0.0.1:7900"
echo "  Key endpoints:"
echo "    GET  /healthz                       — liveness"
echo "    GET  /api/v1/kernel/status          — brain tick status"
echo "    GET  /kernel/engine/status          — AI Kernel (Layer 6)"
echo "    GET  /kernel/engine/results         — recent kernel actions"
echo "    POST /kernel/engine/dispatch        — manual command (dryRun=true default)"
echo "    GET  /hypercore                     — Layer 5 status"
echo "    GET  /ai/think                      — cognitive engine"
echo ""
echo "  Intelligence stack:"
echo "    Layer 6  AI Kernel         (5 s  — infrastructure actuator)"
echo "    Layer 5  HyperCore         (15 s — strategic reasoning)"
echo "    Layer 4  Cognitive Engine  (10 s — planning + learning)"
echo "    Layer 3  Prediction Engine"
echo "    Layer 2  Neural Memory     (Redis + PostgreSQL + Qdrant)"
echo "    Layer 1  Monitoring + Telemetry"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status ghostbrain-core"
echo "    journalctl -u ghostbrain-core -f"
echo "    curl http://127.0.0.1:7900/healthz"
echo "    docker compose -f $GB_DIR/docker/ghostbrain-databases.yml ps"
echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo -e "  ${YLW}This was a dry-run — no changes were made.${RST}"
  echo    "  Remove --dry-run to execute."
  echo ""
fi

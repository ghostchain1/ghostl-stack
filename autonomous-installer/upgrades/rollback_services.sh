#!/usr/bin/env bash
# GhostStack Autonomous Installer — Rollback Services
#
# Submits an advisory rollback proposal to the signing relay.
# If the relay approves (FORCE=1 + relay returns signed confirmation),
# the script re-pins image tags and restarts services using
# `docker compose up -d` with the previous pinned snapshot.
#
# SAFETY INVARIANTS
# -----------------
# 1. NEVER runs `git reset --hard` — image tags are the rollback mechanism.
# 2. In advisory mode (default): posts a relay proposal and exits.
# 3. In force mode (FORCE=1): applies the rollback only after receiving a
#    signed confirmation from the relay.
# 4. The image-tag snapshot file must already exist (written by
#    upgrade_services.sh or manually pinned).
#
# Usage
#   rollback_services.sh [--target-image-tag <tag>] [--dry-run]
#   FORCE=1 rollback_services.sh --target-image-tag <tag>

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"

info() { echo "[$(date +%H:%M:%S)] [rollback_services] $*"; }
warn() { echo "[$(date +%H:%M:%S)] [rollback_services] WARN  $*" >&2; }
die()  { warn "FATAL: $*"; exit 1; }

RELAY_URL="${SIGNING_RELAY_URL:-http://localhost:7910}"
RELAY_TIMEOUT_S="${ROLLBACK_RELAY_TIMEOUT_S:-10}"
IMAGE_SNAPSHOT_DIR="${ROOT}/.tmp/image-snapshots"
COMPOSE_PROJECT="ghostl-stack"
DRY_RUN=0
FORCE="${FORCE:-0}"
TARGET_TAG=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-image-tag) shift; TARGET_TAG="$1" ;;
    --dry-run)          DRY_RUN=1 ;;
    *) warn "Unknown argument: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "${TARGET_TAG}" ]]; then
  die "--target-image-tag <tag> is required."
fi

# ---------------------------------------------------------------------------
# Locate image snapshot
# ---------------------------------------------------------------------------

SNAPSHOT_FILE="${IMAGE_SNAPSHOT_DIR}/${TARGET_TAG}.json"

if [[ ! -f "${SNAPSHOT_FILE}" ]]; then
  warn "Image snapshot for tag '${TARGET_TAG}' not found at ${SNAPSHOT_FILE}."
  warn "Available snapshots:"
  find "${IMAGE_SNAPSHOT_DIR}" -maxdepth 1 -name '*.json' -print0 2>/dev/null \
    | xargs -0 -r basename -s .json \
    | sort \
    || warn "  (none)"
  die "Cannot rollback without an image snapshot."
fi

info "Rollback target tag: ${TARGET_TAG}"
info "Snapshot: ${SNAPSHOT_FILE}"
cat "${SNAPSHOT_FILE}"

# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------

if [[ "${DRY_RUN}" -eq 1 ]]; then
  info "[DRY-RUN] Would propose rollback to tag '${TARGET_TAG}'."
  exit 0
fi

# ---------------------------------------------------------------------------
# Always post advisory proposal first
# ---------------------------------------------------------------------------

PROPOSAL_ID="rollback-$(date +%s)"

PROPOSAL="$(jq -n \
  --arg id   "${PROPOSAL_ID}" \
  --arg tag  "${TARGET_TAG}" \
  --arg snap "${SNAPSHOT_FILE}" \
  '{
    proposal_id: $id,
    type: "rollback",
    chain_id: 14000101,
    gas_token: "GST",
    from: "ghostbrain-guardian",
    target_image_tag: $tag,
    snapshot_file: $snap,
    advisory_only: true
  }')"

info "Submitting rollback proposal to signing relay…"
resp="$(curl -sf --max-time "${RELAY_TIMEOUT_S}" \
  -X POST \
  -H "Content-Type: application/json" \
  --data "${PROPOSAL}" \
  "${RELAY_URL}/relay/upgrade/rollback/propose" 2>/dev/null)" || {
  warn "Signing relay unreachable — rollback proposal not submitted."
  exit 1
}

proposal_id="$(echo "${resp}" | jq -r '.proposal_id // "unknown"' 2>/dev/null)"
relay_approved="$(echo "${resp}" | jq -r '.approved // false' 2>/dev/null)"

info "Relay response: proposal_id=${proposal_id} approved=${relay_approved}"

# ---------------------------------------------------------------------------
# Force-apply (only when relay approves AND FORCE=1)
# ---------------------------------------------------------------------------

if [[ "${FORCE}" != "1" ]]; then
  info "Advisory mode — rollback proposal submitted. Set FORCE=1 to apply after relay approval."
  exit 0
fi

if [[ "${relay_approved}" != "true" ]]; then
  warn "Relay did not approve rollback (approved=${relay_approved}). Refusing to apply."
  exit 1
fi

info "Relay approved rollback — applying image-tag pinned snapshot…"

# Build the tag override env file from the snapshot.
TAG_OVERRIDE_ENV="${ROOT}/.tmp/rollback-${TARGET_TAG}.env"
jq -r 'to_entries[] | "\(.key)=\(.value)"' "${SNAPSHOT_FILE}" > "${TAG_OVERRIDE_ENV}"

info "Overriding image tags from ${TAG_OVERRIDE_ENV}…"
cat "${TAG_OVERRIDE_ENV}"

# Apply via docker compose with the pinned env file — no rebuild.
hg_docker_init
cd "${ROOT}"

# Using --env-file to pin image tags, --no-build to prevent re-building.
# env tags in the snapshot override those in .env.
if hg_docker compose \
    -p "${COMPOSE_PROJECT}" \
    --env-file "${TAG_OVERRIDE_ENV}" \
    up -d --no-build --remove-orphans 2>&1 | tee -a "${ROOT}/logs/rollback.log"; then
  info "Rollback applied successfully (tag=${TARGET_TAG})."
  rm -f "${TAG_OVERRIDE_ENV}"
  exit 0
else
  warn "docker compose up failed during rollback — manual intervention required."
  rm -f "${TAG_OVERRIDE_ENV}"
  exit 1
fi

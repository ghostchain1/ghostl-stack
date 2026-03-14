#!/usr/bin/env bash
# GhostStack Autonomous Installer — Upgrade Services
#
# Checks for upstream git updates and, if found, submits an advisory
# upgrade proposal to the signing relay for human ratification.
#
# SAFETY INVARIANTS
# -----------------
# 1. Never runs `git pull`, `docker compose build`, or `docker compose up`
#    autonomously without explicit `FORCE=1` + governance approval.
# 2. `--dry-run` flag reports what would be proposed without posting.
# 3. If FORCE=1 — still only acts when signed by relay response.
#
# Usage
#   upgrade_services.sh [--dry-run] [--branch <branch>]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

info() { echo "[$(date +%H:%M:%S)] [upgrade_services] $*"; }
warn() { echo "[$(date +%H:%M:%S)] [upgrade_services] WARN  $*" >&2; }

RELAY_URL="${SIGNING_RELAY_URL:-http://localhost:7910}"
RELAY_TIMEOUT_S="${UPGRADE_RELAY_TIMEOUT_S:-10}"
DRY_RUN=0
TARGET_BRANCH="${UPGRADE_BRANCH:-main}"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=1 ;;
    --branch)    shift; TARGET_BRANCH="$1" ;;
    *) warn "Unknown argument: $1"; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Git checks — only git fetch (never git pull)
# ---------------------------------------------------------------------------

cd "${ROOT}"

# Ensure we're on a Git repo.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  warn "Not a git repository at ${ROOT} — skipping upgrade check."
  exit 0
fi

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
current_commit="$(git rev-parse HEAD 2>/dev/null)"

info "Current branch: ${current_branch} @ ${current_commit:0:12}"

# Fetch metadata only — never git pull.
if ! git fetch --quiet origin "${TARGET_BRANCH}" 2>/dev/null; then
  warn "git fetch failed (network unreachable or remote not configured)."
  exit 0
fi

remote_commit="$(git rev-parse "origin/${TARGET_BRANCH}" 2>/dev/null)" || {
  warn "Could not resolve origin/${TARGET_BRANCH}."
  exit 0
}

if [[ "${current_commit}" == "${remote_commit}" ]]; then
  info "Already up-to-date with origin/${TARGET_BRANCH}."
  exit 0
fi

# Summarise what changed (for the proposal payload).
commit_count="$(git rev-list --count "${current_commit}..${remote_commit}" 2>/dev/null || echo 0)"
changed_files="$(git diff --name-only "${current_commit}..${remote_commit}" 2>/dev/null | head -20 || echo '')"

info "Update available: ${commit_count} new commit(s) on origin/${TARGET_BRANCH}."
info "Changed files (up to 20): ${changed_files}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  info "[DRY-RUN] Would propose upgrade from ${current_commit:0:12} → ${remote_commit:0:12}."
  exit 0
fi

info "Submitting advisory upgrade proposal to signing relay…"

# Build the list of changed files as a JSON array (safe — from git diff output).
files_json="$(echo "${changed_files}" | jq -R -s 'split("\n") | map(select(length>0))')"

PROPOSAL="$(jq -n \
  --arg id     "upgrade-$(date +%s)" \
  --arg branch "${TARGET_BRANCH}" \
  --arg from   "${current_commit}" \
  --arg to     "${remote_commit}" \
  --argjson cc "${commit_count}" \
  --argjson cf "${files_json}" \
  '{
    proposal_id: $id,
    type: "upgrade",
    chain_id: 14000101,
    gas_token: "GST",
    from: "ghostbrain-guardian",
    target_branch: $branch,
    current_commit: $from,
    target_commit: $to,
    commit_count: $cc,
    changed_files: $cf,
    advisory_only: true
  }')"

resp="$(curl -sf --max-time "${RELAY_TIMEOUT_S}" \
  -X POST \
  -H "Content-Type: application/json" \
  --data "${PROPOSAL}" \
  "${RELAY_URL}/relay/upgrade/propose" 2>/dev/null)" || {
  warn "Signing relay unreachable — upgrade proposal not submitted."
  exit 1
}

proposal_id="$(echo "${resp}" | jq -r '.proposal_id // "unknown"' 2>/dev/null)"
info "Upgrade proposal submitted (id=${proposal_id}). Awaiting governance ratification."
exit 0

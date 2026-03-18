#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICY_RUNNER="${ROOT_DIR}/services/ai-policy/gst_policy.cjs"

log() { printf '[gst-ai-policy-gate] %s\n' "$*"; }
fail() { printf '[gst-ai-policy-gate][FAIL] %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "missing required binary: node"
[ -f "$POLICY_RUNNER" ] || fail "policy runner not found: ${POLICY_RUNNER#$ROOT_DIR/}"

DIFF_EXCLUDES=(
  ':(exclude)config/gst-leakage-baseline.txt'
  ':(exclude)config/gst-symbol-baseline.txt'
  ':(exclude)ops/policy/no-eth-rpc-baseline.txt'
  ':(exclude)scripts/gst-leakage-gate.sh'
  ':(exclude)scripts/gst-symbol-gate.sh'
  ':(exclude)scripts/gst-ai-policy-gate.sh'
)

diff_payload="$(git -C "$ROOT_DIR" diff --cached -- . "${DIFF_EXCLUDES[@]}" || true)"
if [ -z "$diff_payload" ]; then
  diff_payload="$(git -C "$ROOT_DIR" diff -- . "${DIFF_EXCLUDES[@]}" || true)"
fi

if [ -z "$diff_payload" ]; then
  log "OK: no local diff to evaluate."
  exit 0
fi

printf '%s' "$diff_payload" \
  | node "$POLICY_RUNNER" --stdin --source codex_preflight_diff --context ai_patch --context pr_diff

log "OK: diff passed AI GST policy."

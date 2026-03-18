#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

: "${PROPOSAL_ID:?set PROPOSAL_ID}"
: "${RELEASE_ID:?set RELEASE_ID}"
: "${RELEASE_GATE:?set RELEASE_GATE}"

cmd=(
  node
  --experimental-strip-types
  "$ROOT_DIR/tools/governance/create-constitution-proposal.ts"
  --proposal-id "$PROPOSAL_ID"
  --release-id "$RELEASE_ID"
  --release-gate "$RELEASE_GATE"
)

[[ -n "${MANIFEST_PATH:-}" ]] && cmd+=(--manifest "$MANIFEST_PATH")
[[ -n "${CONSTITUTION_PATH:-}" ]] && cmd+=(--constitution "$CONSTITUTION_PATH")
[[ -n "${SIGNATURE_PATH:-}" ]] && cmd+=(--signature "$SIGNATURE_PATH")
[[ -n "${TIMELOCK_EXPIRES_AT:-}" ]] && cmd+=(--timelock-expires-at "$TIMELOCK_EXPIRES_AT")
[[ -n "${OUT_PATH:-}" ]] && cmd+=(--out "$OUT_PATH")

exec "${cmd[@]}"

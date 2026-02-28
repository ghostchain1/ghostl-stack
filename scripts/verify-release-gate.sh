#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROPOSAL_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --proposal-id)
      PROPOSAL_ID="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

[[ -n "$PROPOSAL_ID" ]] || {
  echo "missing --proposal-id <id>" >&2
  exit 2
}

: "${RPC_L1:?set RPC_L1 (e.g. http://127.0.0.1:18545)}"
: "${MAINNET_RELEASE_GATE_ADDRESS:?set MAINNET_RELEASE_GATE_ADDRESS (0x...)}"

CONSTITUTION_DOC="${CONSTITUTION_DOC:-$ROOT_DIR/docs/constitution/GhostChain-Constitution.md}"
MANIFEST_PATH="${MANIFEST_PATH:-$ROOT_DIR/artifacts/release/release_manifest.json}"
ATTESTATION_VERIFY_SCRIPT="${ROOT_DIR}/scripts/release/verify-release-attestation.sh"

[[ -f "$CONSTITUTION_DOC" ]] || {
  echo "constitution missing: $CONSTITUTION_DOC" >&2
  exit 1
}
[[ -f "$MANIFEST_PATH" ]] || {
  echo "release manifest missing: $MANIFEST_PATH" >&2
  exit 1
}

REQUIRE_CONSTITUTIONAL_FIELDS=1 bash "$ROOT_DIR/scripts/verify-governance.sh" --proposal-id "$PROPOSAL_ID" >/dev/null
bash "$ATTESTATION_VERIFY_SCRIPT" >/dev/null

allowed="$(
  python3 "$ROOT_DIR/launch-system/lib/evmrpc.py" \
    is-mainnet-launch-allowed \
    --rpc "$RPC_L1" \
    --release-gate "$MAINNET_RELEASE_GATE_ADDRESS"
)"

if [[ "$allowed" != "true" ]]; then
  echo "release gate denied launch (isMainnetLaunchAllowed() != true)" >&2
  exit 1
fi

constitution_hash="$(sha256sum "$CONSTITUTION_DOC" | awk '{print $1}')"
manifest_hash="$(sha256sum "$MANIFEST_PATH" | awk '{print $1}')"

mkdir -p "$ROOT_DIR/artifacts/release"
cat >"$ROOT_DIR/artifacts/release/release_gate_verification.json" <<JSON
{
  "ok": true,
  "proposalId": "$PROPOSAL_ID",
  "constitutionPath": "$CONSTITUTION_DOC",
  "constitutionHash": "sha256:$constitution_hash",
  "manifestPath": "$MANIFEST_PATH",
  "manifestHash": "sha256:$manifest_hash",
  "releaseGateAddress": "$MAINNET_RELEASE_GATE_ADDRESS",
  "verifiedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "release_gate_verify:PASS"

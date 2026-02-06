#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

sha="$(git rev-parse HEAD)"
now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ref="${GST_ATTESTATION_REF:-}"
if [ -z "$ref" ]; then
  ref="gst-native-v3"
fi

update_doc() {
  local path="$1"
  [ -f "$path" ] || return 0

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  awk -v now="$now_utc" -v sha="$sha" '
    BEGIN { done_gen=0; done_ref=0 }
    /^Generated \(UTC\):/ {
      if (!done_gen) { print "Generated (UTC): `" now "`"; done_gen=1; next }
    }
    /^Tested git ref:/ {
      if (!done_ref) { print "Tested git ref: `" ref "`"; done_ref=1; next }
    }
    { print }
  ' "$path" >"$tmp"
  mv "$tmp" "$path"
}

update_doc "docs/gst-migration/EVIDENCE-PACK.md"
update_doc "docs/gst-migration/PHASE6_ATTESTATION.md"

echo "[update-gst-attestation-metadata] updated timestamps for ref=$ref at $now_utc (head=$sha)"

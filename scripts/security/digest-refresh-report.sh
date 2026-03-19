#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/security}"
mkdir -p "$OUT_DIR"

JSON_OUT="$OUT_DIR/digest-refresh-report.json"
MD_OUT="$OUT_DIR/digest-refresh-report.md"

COMPOSE_FILES=(
  "docker-compose.yml"
  "docker-compose.dev.yml"
  "docker-compose.econ.devnet.yml"
  "docker-compose.econ.testnet.yml"
  "docker-compose.econ.mainnet.yml"
  "docker-compose.autonomy.yml"
  "docker-compose.phase3.yml"
  "docker-compose.ai-consensus.yml"
  "docker-compose.agents.yml"
  "docker-compose.cascading-finality.yml"
  "docker-compose.phase3.secrets.yml"
  "apps/docker-compose.yml"
  "apps/docker-compose.dev.yml"
  "services/ghost-exec/docker-compose.yml"
  "services/ghost-sequencer/docker-compose.yml"
  "services/ghost-deriver/docker-compose.yml"
  "services/ghost-settlement/docker-compose.yml"
  "services/ghost-bridge/docker-compose.yml"
  "services/ghost-proof/docker-compose.yml"
)

if ! command -v docker >/dev/null 2>&1; then
  cat >"$JSON_OUT" <<JSON
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ok": false,
  "error": "docker_not_available",
  "checked": 0,
  "stale": 0,
  "failedLookups": 0,
  "items": []
}
JSON
  cat >"$MD_OUT" <<MD
# Digest Refresh Report

- Generated (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Status: docker not available, report skipped
MD
  echo "[digest-refresh] WARN docker not available; report generated with skip status"
  exit 0
fi

if ! docker buildx version >/dev/null 2>&1; then
  cat >"$JSON_OUT" <<JSON
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ok": false,
  "error": "docker_buildx_not_available",
  "checked": 0,
  "stale": 0,
  "failedLookups": 0,
  "items": []
}
JSON
  cat >"$MD_OUT" <<MD
# Digest Refresh Report

- Generated (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Status: docker buildx not available, report skipped
MD
  echo "[digest-refresh] WARN docker buildx not available; report generated with skip status"
  exit 0
fi

tmp_items="$(mktemp)"
checked=0
stale=0
failed=0

declare -A latest_cache
declare -A lookup_cache_ok

escape_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/ }"
  printf '%s' "$s"
}

record_item() {
  local file="$1"
  local image_raw="$2"
  local ref="$3"
  local pinned="$4"
  local latest="$5"
  local status="$6"
  local note="$7"

  printf '{"file":"%s","imageRaw":"%s","ref":"%s","pinnedDigest":"%s","latestDigest":"%s","status":"%s","note":"%s"}\n' \
    "$(escape_json "$file")" \
    "$(escape_json "$image_raw")" \
    "$(escape_json "$ref")" \
    "$(escape_json "$pinned")" \
    "$(escape_json "$latest")" \
    "$(escape_json "$status")" \
    "$(escape_json "$note")" \
    >>"$tmp_items"
}

extract_default_ref() {
  local raw="$1"
  if [[ "$raw" =~ ^\$\{[A-Za-z0-9_]+:-([^}]+)\}$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  printf '%s' "$raw"
}

parse_ref() {
  local ref="$1"
  if [[ "$ref" =~ ^(.+)@sha256:([0-9a-f]{64})$ ]]; then
    local base="${BASH_REMATCH[1]}"
    local digest="sha256:${BASH_REMATCH[2]}"
    if [[ "$base" == *":"* ]]; then
      printf '%s|%s\n' "$base" "$digest"
      return 0
    fi
  fi
  return 1
}

for file in "${COMPOSE_FILES[@]}"; do
  [[ -f "$file" ]] || continue

  while IFS= read -r raw; do
    [[ -n "$raw" ]] || continue

    resolved="$(extract_default_ref "$raw")"
    if ! parsed="$(parse_ref "$resolved")"; then
      continue
    fi

    ref="${parsed%%|*}"
    pinned="${parsed#*|}"
    checked=$((checked + 1))

    latest=""
    if [[ -v lookup_cache_ok["$ref"] ]]; then
      if [[ "${lookup_cache_ok[$ref]}" == "1" ]]; then
        latest="${latest_cache[$ref]}"
      fi
    else
      if latest="$(docker buildx imagetools inspect "$ref" 2>/dev/null | awk '/^Digest:/ {print $2; exit}')" && [[ -n "$latest" ]]; then
        lookup_cache_ok["$ref"]="1"
        latest_cache["$ref"]="$latest"
      else
        lookup_cache_ok["$ref"]="0"
      fi
    fi

    if [[ -n "$latest" ]]; then
      if [[ "$latest" == "$pinned" ]]; then
        record_item "$file" "$raw" "$ref" "$pinned" "$latest" "current" ""
      else
        stale=$((stale + 1))
        record_item "$file" "$raw" "$ref" "$pinned" "$latest" "stale" "digest drift detected"
      fi
    else
      failed=$((failed + 1))
      record_item "$file" "$raw" "$ref" "$pinned" "" "lookup_failed" "unable to resolve latest digest"
    fi
  done < <(
    rg -No "^[[:space:]]*image:[[:space:]]*([^[:space:]]+)" "$file" -r '$1' || true
  )
done

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo "{"
  echo "  \"generatedAt\": \"$generated_at\"," 
  echo "  \"ok\": true,"
  echo "  \"checked\": $checked,"
  echo "  \"stale\": $stale,"
  echo "  \"failedLookups\": $failed,"
  echo "  \"items\": ["
  if [[ -s "$tmp_items" ]]; then
    awk 'NR>1{print ","} {printf "    %s", $0} END{print ""}' "$tmp_items"
  fi
  echo "  ]"
  echo "}"
} >"$JSON_OUT"

{
  echo "# Digest Refresh Report"
  echo
  echo "- Generated (UTC): $generated_at"
  echo "- Checked: **$checked**"
  echo "- Stale: **$stale**"
  echo "- Lookup failures: **$failed**"
  echo "- Mode: report-only (non-blocking)"
  echo

  if [[ "$checked" -eq 0 ]]; then
    echo "No digest-pinned image references were found in the configured compose scope."
  else
    echo "## Results"
    echo
    while IFS= read -r line; do
      file="$(printf '%s' "$line" | sed -n 's/.*"file":"\([^"]*\)".*/\1/p')"
      ref="$(printf '%s' "$line" | sed -n 's/.*"ref":"\([^"]*\)".*/\1/p')"
      status="$(printf '%s' "$line" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
      pinned="$(printf '%s' "$line" | sed -n 's/.*"pinnedDigest":"\([^"]*\)".*/\1/p')"
      latest="$(printf '%s' "$line" | sed -n 's/.*"latestDigest":"\([^"]*\)".*/\1/p')"
      note="$(printf '%s' "$line" | sed -n 's/.*"note":"\([^"]*\)".*/\1/p')"

      echo "- **$status** — \`$ref\` in \`$file\`"
      echo "  - pinned: \`$pinned\`"
      if [[ -n "$latest" ]]; then
        echo "  - latest: \`$latest\`"
      fi
      if [[ -n "$note" ]]; then
        echo "  - note: $note"
      fi
    done <"$tmp_items"
  fi
} >"$MD_OUT"

rm -f "$tmp_items"

echo "[digest-refresh] report generated: $MD_OUT"
echo "[digest-refresh] report generated: $JSON_OUT"
exit 0

#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PIL_BASE_URL:-http://localhost:3220}"
PIL_REQUIRED="${PIL_REQUIRED:-0}"

if ! curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  if [ "$PIL_REQUIRED" = "1" ]; then
    echo "PIL not reachable at ${BASE_URL} (set PIL_BASE_URL or start the service)" >&2
    exit 1
  fi
  echo "PIL not reachable at ${BASE_URL}; skipping phase 2 smoke tests."
  exit 0
fi

simulations=$(curl -fsS "${BASE_URL}/v1/simulations")
first_id=$(node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(0,"utf8"));const items=data.simulations||[];console.log(items[0]?.id||"");' <<<"$simulations")

if [[ -z "$first_id" ]]; then
  echo "No simulations returned from ${BASE_URL}/v1/simulations" >&2
  exit 1
fi

results=$(curl -fsS "${BASE_URL}/v1/simulations/${first_id}/results")
node -e 'const fs=require("fs");const data=JSON.parse(fs.readFileSync(0,"utf8"));const items=data.results||[];if(!items.length){process.exit(1);}' <<<"$results"

echo "Phase 2 smoke tests passed."

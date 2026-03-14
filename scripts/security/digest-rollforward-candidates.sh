#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/security}"
mkdir -p "$OUT_DIR"

JSON_IN="$OUT_DIR/digest-refresh-report.json"
MD_OUT="$OUT_DIR/digest-rollforward-candidates.md"

if [[ ! -f "$JSON_IN" ]]; then
  echo "[digest-rollforward] missing input report: $JSON_IN"
  echo "[digest-rollforward] generating digest refresh report first"
  bash scripts/security/digest-refresh-report.sh
fi

if [[ ! -f "$JSON_IN" ]]; then
  echo "[digest-rollforward] unable to generate input report"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[digest-rollforward] node is required"
  exit 1
fi

node - "$JSON_IN" "$MD_OUT" <<'NODE'
const fs = require('fs');

const jsonPath = process.argv[2];
const outPath = process.argv[3];

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (error) {
  console.error('[digest-rollforward] failed to parse json report');
  process.exit(1);
}

const generatedAt = parsed.generatedAt || new Date().toISOString();
const items = Array.isArray(parsed.items) ? parsed.items : [];
const stale = items.filter((item) => item && item.status === 'stale');

const lines = [];
lines.push('# Digest Rollforward Candidates');
lines.push('');
lines.push(`- Generated (UTC): ${generatedAt}`);
lines.push(`- Source report: artifacts/security/digest-refresh-report.json`);
lines.push(`- Stale items: **${stale.length}**`);
lines.push('');

if (stale.length === 0) {
  lines.push('No stale digest candidates were detected.');
} else {
  lines.push('## Candidates');
  lines.push('');
  stale
    .sort((a, b) => {
      const fileA = String(a.file || '');
      const fileB = String(b.file || '');
      if (fileA !== fileB) return fileA.localeCompare(fileB);
      return String(a.ref || '').localeCompare(String(b.ref || ''));
    })
    .forEach((item) => {
      lines.push(`- **${item.file || 'unknown'}**`);
      lines.push(`  - ref: \`${item.ref || ''}\``);
      lines.push(`  - pinned: \`${item.pinnedDigest || ''}\``);
      lines.push(`  - latest: \`${item.latestDigest || ''}\``);
      lines.push('');
    });

  lines.push('## Suggested update format');
  lines.push('');
  lines.push('Use this replacement shape per candidate:');
  lines.push('');
  lines.push('- `image: <ref>@<latestDigest>`');
}

fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`[digest-rollforward] candidates report generated: ${outPath}`);
NODE

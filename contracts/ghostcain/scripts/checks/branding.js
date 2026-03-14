#!/usr/bin/env node
/**
 * scripts/checks/branding.js
 *
 * Verifies that no legacy OpenZeppelin / ERC / WETH / MetaMask identifiers
 * remain in project-owned Solidity and config files.
 *
 * Usage:
 *   node scripts/checks/branding.js           # exits 1 on violations
 *   node scripts/checks/branding.js --verbose # show all hits
 *
 * Added to npm scripts as:
 *   "check:branding": "node scripts/checks/branding.js"
 *
 * Run automatically on pre-commit via husky.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');

/** File names to skip entirely (the checker itself is self-referential). */
const SKIP_FILES = new Set(['branding.js']);

/** Directories to skip entirely. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'forge-std',
  'halmos',
  'cache',
  'cache-codex',
  'cache-legacy',
  '.claude',
  'integration',
  'artifacts',
  'out',
  'out-codex',
  'out-legacy',
  'typechain-types',
]);

/** File extensions to scan. */
const SCAN_EXTS = new Set(['.sol', '.js', '.ts', '.mjs', '.md', '.adoc', '.json', '.toml', '.txt', '.yml', '.yaml']);

/**
 * Forbidden patterns — legacy identifiers that must not appear in project-owned files.
 * Matches: bare ERC digits, bare IERC, OpenZeppelin/openzeppelin, WETH (not WGST9), MetaMask.
 */
const FORBIDDEN = /OpenZeppelin|openzeppelin|WETH(?!9|GST)|MetaMask|\bERC\d|\bERC-\d|\bIERC\b|\bIERC\d/;

/**
 * Exemptions — lines that legitimately contain a forbidden-looking string
 * (third-party registry references, custom:storage annotations, npm alias values).
 */
const EXEMPT = [
  /github\.com\/[a-zA-Z0-9_.-]*\/erc\d+/i,         // external GitHub EIP repo URLs
  /@custom:storage-location erc7201/,                // EIP storage slot annotation (standard name)
  /registry\.npmjs\.org/,                            // npm registry resolved URLs in package-lock
  /npm:@openzeppelin\//,                             // npm alias values  (package.json / lock)
  /"name":\s*"@openzeppelin\//,                      // npm registry name fields in package-lock
  /openzeppelin-upgrades-core/,                      // bin alias name in package-lock
  /"@metamask/,                                      // npm metamask package references
  /resolved.*metamask/,                              // package-lock resolved field
];

// ── Walker ───────────────────────────────────────────────────────────────────

const violations = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }

    if (!SCAN_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    if (SKIP_FILES.has(entry.name)) continue;

    let lines;
    try {
      lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    } catch {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!FORBIDDEN.test(line)) continue;
      if (EXEMPT.some(rx => rx.test(line))) continue;
      violations.push({ file: path.relative(ROOT, fullPath), line: i + 1, text: line.trimEnd().slice(0, 120) });
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

walk(ROOT);

if (violations.length === 0) {
  console.log('check:branding — PASS (0 violations)');
  process.exit(0);
} else {
  console.error(`check:branding — FAIL (${violations.length} violation${violations.length === 1 ? '' : 's'})\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    if (verbose) console.error(`    ${v.text}`);
  }
  if (!verbose) console.error('\nRun with --verbose to see offending lines.');
  process.exit(1);
}

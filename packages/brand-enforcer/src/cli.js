#!/usr/bin/env node
/**
 * @file src/cli.js
 * @description ghost-brand CLI — Brand compliance scanner for GhostChain.
 *
 * Usage:
 *   ghost-brand scan [path] [--spec <spec.json>] [--format json|text] [--allowlist <path>]
 *   ghost-brand check-spec [spec.json]
 *   ghost-brand help
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { scanRepo, loadBrandSpec, validateTokenMetadata, BRAND } from '../index.js';

const VERSION = '1.0.0';

function printHelp() {
  process.stdout.write(`
ghost-brand v${VERSION} — GhostChain brand compliance enforcer

COMMANDS:
  scan [path]              Scan repository (or path) for brand violations
  check-spec [spec.json]   Validate a brand spec JSON file
  help                     Show this help

OPTIONS for scan:
  --spec <file>            Path to docs/brand/spec.json (default: auto-detect)
  --format json|text       Output format (default: text)
  --allowlist <paths...>   Comma-separated extra exempt path substrings
  --no-spec                Skip spec.json validation
  --exit-zero              Always exit 0 (useful for audit-only runs)

EXAMPLES:
  ghost-brand scan
  ghost-brand scan ./contracts --format json
  ghost-brand scan . --allowlist "contracts/lib,docs/architecture"
  ghost-brand check-spec docs/brand/spec.json

EXIT CODES:
  0  No violations / exit-zero flag set
  1  Brand violations found
  2  Usage error
`);
}

function parseArgs(args) {
  const opts = {
    command: 'help',
    rootPath: process.cwd(),
    specPath: undefined,
    format: 'text',
    allowlist: [],
    validateSpec: true,
    exitZero: false,
  };

  if (args.length === 0) return opts;
  opts.command = args[0];

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--spec')       { opts.specPath = resolve(next); i += 2; }
    else if (arg === '--format')     { opts.format = next; i += 2; }
    else if (arg === '--allowlist')  { opts.allowlist = next.split(',').map(s => s.trim()); i += 2; }
    else if (arg === '--no-spec')    { opts.validateSpec = false; i++; }
    else if (arg === '--exit-zero')  { opts.exitZero = true; i++; }
    else if (!arg.startsWith('--')) {
      // Positional argument: path
      if (opts.command === 'scan' || opts.command === 'check-spec') {
        opts.rootPath = resolve(arg);
      }
      i++;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function colorSeverity(severity) {
  const codes = { CRITICAL: '\x1b[31m', HIGH: '\x1b[33m', MEDIUM: '\x1b[36m', LOW: '\x1b[90m' };
  const reset = '\x1b[0m';
  return (codes[severity] ?? '') + severity + reset;
}

function formatText(result) {
  const { violations, scanned, exempt, summary } = result;
  const lines = [];
  lines.push(`\nghost-brand scan — GhostChain Brand Enforcer`);
  lines.push(`Files scanned: ${scanned}  Exempt: ${exempt}`);
  lines.push(`Brand: name="${BRAND.name}" symbol="${BRAND.symbol}" decimals=${BRAND.decimals}`);
  lines.push('');

  if (violations.length === 0) {
    lines.push('\x1b[32m✔ No brand violations found.\x1b[0m\n');
    return lines.join('\n');
  }

  for (const v of violations) {
    lines.push(`[${colorSeverity(v.severity)}] ${v.ruleId} — ${v.message}`);
    lines.push(`  File: ${v.file}${v.line > 0 ? ':' + v.line : ''}`);
    if (v.snippet) lines.push(`  ↳ ${v.snippet}`);
    lines.push('');
  }
  lines.push(`Summary: ${summary.total} violation(s) — CRITICAL:${summary.bySeverity.CRITICAL} HIGH:${summary.bySeverity.HIGH} MEDIUM:${summary.bySeverity.MEDIUM} LOW:${summary.bySeverity.LOW}`);
  return lines.join('\n');
}

async function cmdScan(opts) {
  const result = scanRepo(opts.rootPath, {
    extraAllowlistPaths: opts.allowlist,
    specPath: opts.specPath,
    validateSpec: opts.validateSpec,
  });

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatText(result) + '\n');
  }

  if (!opts.exitZero && result.violations.length > 0) process.exit(1);
}

async function cmdCheckSpec(opts) {
  const specPath = opts.specPath ?? join(opts.rootPath, 'docs/brand/spec.json');
  try {
    const spec = loadBrandSpec(specPath);
    const metaViolations = validateTokenMetadata(spec, specPath);
    if (metaViolations.length === 0) {
      process.stdout.write(`\x1b[32m✔ spec.json is valid: name="${spec.name}" symbol="${spec.symbol}" decimals=${spec.decimals}\x1b[0m\n`);
    } else {
      for (const v of metaViolations) process.stderr.write(`[${v.severity}] ${v.ruleId}: ${v.message}\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

// Entry point
const args = process.argv.slice(2);
const opts = parseArgs(args);

switch (opts.command) {
  case 'scan':        await cmdScan(opts); break;
  case 'check-spec':  await cmdCheckSpec(opts); break;
  case 'help':
  default:            printHelp(); break;
}

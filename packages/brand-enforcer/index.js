/**
 * @module @ghostchain/brand-enforcer
 * @description Brand compliance scanner for the GhostChain monorepo.
 *
 * Enforces constitutional brand invariants:
 *   - Token name  = "Ghost"
 *   - Token symbol = "GST"
 *   - Decimals    = 18
 *   - No "ETH"/"Ether"/"Ethereum" in canonical metadata surfaces (bridge exempt)
 *
 * Zero external dependencies — uses only node:fs, node:path, node:url.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND,
  VIOLATION_PATTERNS,
  BRIDGE_ALLOWLIST_PATTERNS,
  REQUIRED_ANCHORS,
  SCANNABLE_EXTENSIONS,
} from './src/rules.js';

export { BRAND, VIOLATION_PATTERNS, BRIDGE_ALLOWLIST_PATTERNS };

// ---------------------------------------------------------------------------
// Canonical brand spec (loaded once, exported for consumers)
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Load a brand spec JSON file and validate its required fields.
 * @param {string} [specPath] - Absolute path to spec.json; defaults to docs/brand/spec.json
 * @returns {{ name:string, symbol:string, decimals:number, chain:string, [key:string]:any }}
 */
export function loadBrandSpec(specPath) {
  const resolved = specPath ?? join(__dirname, '../../docs/brand/spec.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw new Error(`brand-enforcer: cannot load spec at ${resolved}: ${err.message}`);
  }
  const required = ['name', 'symbol', 'decimals', 'chain'];
  for (const key of required) {
    if (raw[key] === undefined) throw new Error(`brand-enforcer: spec missing required field "${key}"`);
  }
  if (raw.name !== BRAND.name)     throw new Error(`brand-enforcer: spec.name must be "${BRAND.name}", got "${raw.name}"`);
  if (raw.symbol !== BRAND.symbol) throw new Error(`brand-enforcer: spec.symbol must be "${BRAND.symbol}", got "${raw.symbol}"`);
  if (raw.decimals !== BRAND.decimals) throw new Error(`brand-enforcer: spec.decimals must be ${BRAND.decimals}, got ${raw.decimals}`);
  return raw;
}

// ---------------------------------------------------------------------------
// Core violation types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Violation
 * @property {string} ruleId       - e.g. "BRAND-001"
 * @property {string} severity     - CRITICAL | HIGH | MEDIUM | LOW
 * @property {string} message      - Human-readable description
 * @property {string} file         - Repo-relative file path
 * @property {number} line         - 1-based line number
 * @property {string} snippet      - The offending line (trimmed, max 120 chars)
 */

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given path matches any bridge allowlist pattern,
 * or matches entries from an external allowlist paths array.
 * @param {string} filePath - Repo-relative path
 * @param {string[]} [extraAllowlistPaths] - Additional path prefixes/substrings to exempt
 */
function isBridgeExempt(filePath, extraAllowlistPaths = []) {
  if (BRIDGE_ALLOWLIST_PATTERNS.some((p) => p.test(filePath))) return true;
  if (extraAllowlistPaths.some((prefix) => filePath.includes(prefix))) return true;
  return false;
}

/**
 * Walk a directory tree and yield all regular file paths matching SCANNABLE_EXTENSIONS.
 * @param {string} dir - Absolute path to root
 * @returns {string[]} Absolute paths
 */
function walkFiles(dir) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        // Skip well-known noise directories early
        if (['node_modules', '.git', 'dist', 'cache', 'cache-codex', 'out-codex'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry.name))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Scan a single file's content for brand violations using VIOLATION_PATTERNS.
 * Bridge-exempt files are skipped.
 *
 * @param {string} content     - File content string
 * @param {string} filePath    - Repo-relative path (used for exemption checks and reporting)
 * @param {string[]} [extraAllowlistPaths]
 * @returns {Violation[]}
 */
export function validateNoEthLeaks(content, filePath, extraAllowlistPaths = []) {
  if (isBridgeExempt(filePath, extraAllowlistPaths)) return [];

  const violations = [];
  const lines = content.split('\n');

  for (const pattern of VIOLATION_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip single-line brand-enforcer-ignore comments
      if (/brand-enforcer-ignore/.test(line)) continue;
      // Skip pure comment lines (avoid false positives in docs/spec explanations)
      if (/^\s*(?:\/\/|#|\/\*|\*)/.test(line) && !/symbol|decimals|name.*:/.test(line)) continue;

      if (pattern.regex.test(line)) {
        violations.push({
          ruleId: pattern.id,
          severity: pattern.severity,
          message: pattern.description,
          file: filePath,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return violations;
}

/**
 * Validate a token metadata object against canonical brand constants.
 *
 * @param {{ name?:string, symbol?:string, decimals?:number, [key:string]:any }} metadata
 * @param {string} [context] - Optional context label (e.g. filename)
 * @returns {Violation[]}
 */
export function validateTokenMetadata(metadata, context = '<inline>') {
  const violations = [];

  if (metadata.name !== undefined && metadata.name !== BRAND.name) {
    violations.push({
      ruleId: 'BRAND-META-001',
      severity: 'CRITICAL',
      message: `Token name must be "${BRAND.name}", got "${metadata.name}"`,
      file: context,
      line: 0,
      snippet: JSON.stringify({ name: metadata.name }),
    });
  }
  if (metadata.symbol !== undefined && metadata.symbol !== BRAND.symbol) {
    violations.push({
      ruleId: 'BRAND-META-002',
      severity: 'CRITICAL',
      message: `Token symbol must be "${BRAND.symbol}", got "${metadata.symbol}"`,
      file: context,
      line: 0,
      snippet: JSON.stringify({ symbol: metadata.symbol }),
    });
  }
  if (metadata.decimals !== undefined && metadata.decimals !== BRAND.decimals) {
    violations.push({
      ruleId: 'BRAND-META-003',
      severity: 'CRITICAL',
      message: `Token decimals must be ${BRAND.decimals}, got ${metadata.decimals}`,
      file: context,
      line: 0,
      snippet: JSON.stringify({ decimals: metadata.decimals }),
    });
  }
  return violations;
}

/**
 * Validate UI-facing strings in a file for canonical brand presentation.
 * Only considers strings that appear in user-surfaced contexts (labels, titles, placeholders).
 *
 * @param {string} content
 * @param {string} filePath - Repo-relative path
 * @returns {Violation[]}
 */
export function validateUIStrings(content, filePath) {
  if (isBridgeExempt(filePath)) return [];

  const violations = [];
  const lines = content.split('\n');

  // UI string heuristics: label="...", title="...", placeholder="...", aria-label="..."
  const UI_CONTEXT_RE = /(?:label|title|placeholder|aria-label|header|heading)\s*[=:]\s*["']([^"']+)["']/ig;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    while ((m = UI_CONTEXT_RE.exec(line)) !== null) {
      const uiStr = m[1];
      if (/\bETH\b|\bEther\b|\bEthereum\b/.test(uiStr) && !/bridge|deposit|withdraw|l1/i.test(uiStr)) {
        violations.push({
          ruleId: 'BRAND-UI-001',
          severity: 'HIGH',
          message: `UI string contains forbidden ETH branding: "${uiStr}"`,
          file: filePath,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return violations;
}

/**
 * Check required anchor patterns are present in their designated files.
 * @param {string} content
 * @param {string} filePath - Repo-relative path
 * @returns {Violation[]}
 */
function validateRequiredAnchors(content, filePath) {
  const violations = [];
  for (const anchor of REQUIRED_ANCHORS) {
    if (anchor.filePattern.test(filePath)) {
      if (!anchor.requiredPattern.test(content)) {
        violations.push({
          ruleId: anchor.id,
          severity: 'CRITICAL',
          message: anchor.description,
          file: filePath,
          line: 0,
          snippet: `Expected pattern: ${anchor.requiredPattern}`,
        });
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Repository scanner
// ---------------------------------------------------------------------------

/**
 * Scan an entire repository directory for brand violations.
 *
 * @param {string} rootPath - Absolute path to the repo root
 * @param {Object} [options]
 * @param {string[]} [options.extraAllowlistPaths] - Additional path substrings to exempt
 * @param {string}   [options.specPath]            - Custom path to spec.json
 * @param {boolean}  [options.validateSpec=true]   - Load and validate docs/brand/spec.json
 * @returns {{ violations: Violation[], scanned: number, exempt: number, summary: Object }}
 */
export function scanRepo(rootPath, options = {}) {
  const {
    extraAllowlistPaths = [],
    specPath,
    validateSpec = true,
  } = options;

  // Optionally validate the spec file first
  const specViolations = [];
  if (validateSpec) {
    try {
      loadBrandSpec(specPath);
    } catch (err) {
      specViolations.push({
        ruleId: 'BRAND-SPEC-001',
        severity: 'CRITICAL',
        message: err.message,
        file: 'docs/brand/spec.json',
        line: 0,
        snippet: '',
      });
    }
  }

  const files = walkFiles(rootPath);
  let scanned = 0;
  let exempt = 0;
  const violations = [...specViolations];
  const byCritical = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  for (const absPath of files) {
    const relPath = relative(rootPath, absPath);
    if (isBridgeExempt(relPath, extraAllowlistPaths)) {
      exempt++;
      continue;
    }
    scanned++;

    let content;
    try {
      content = readFileSync(absPath, 'utf8');
    } catch {
      continue;
    }

    const fileViolations = [
      ...validateNoEthLeaks(content, relPath, extraAllowlistPaths),
      ...validateUIStrings(content, relPath),
      ...validateRequiredAnchors(content, relPath),
    ];
    violations.push(...fileViolations);
  }

  for (const v of violations) {
    if (byCritical[v.severity] !== undefined) byCritical[v.severity]++;
  }

  return {
    violations,
    scanned,
    exempt,
    summary: {
      total: violations.length,
      bySeverity: byCritical,
      passed: violations.length === 0,
    },
  };
}

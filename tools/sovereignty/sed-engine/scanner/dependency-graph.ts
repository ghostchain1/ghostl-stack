/**
 * @file tools/sovereignty/sed-engine/scanner/dependency-graph.ts
 * @description Walks all package.json files in the monorepo (excluding node_modules,
 *   dist, out) and identifies any npm dependency on a forbidden Ethereum package.
 *
 * Outputs a DependencyGraph — a structured report of every package that imports
 * forbidden dependencies, grouped by workspace package.
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR  = path.join(__dirname, "../rules");

const FORBIDDEN_DEPS = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "forbidden-deps.json"), "utf8"));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DepViolation {
  packageFile:      string;   // absolute path to package.json
  workspaceName:    string;   // "name" field from package.json
  dep:              string;   // the forbidden package name ("ethers", etc.)
  version:          string;   // pinned version string ("^6.0.0", etc.)
  devOnly:          boolean;  // true = in devDependencies only
  ghostEquivalent:  string;   // suggested replacement
  severity:         string;
  exempt:           boolean;  // true = resides in a known compat path
}

export interface DependencyGraph {
  scannedManifests: number;
  violations:       DepViolation[];
  exemptedPaths:    string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FORBIDDEN_SET: Set<string>                 = new Set(FORBIDDEN_DEPS.forbiddenPackages ?? []);
const GHOST_EQUIV:   Record<string, string>      = FORBIDDEN_DEPS.ghostEquivalents ?? {};
const SEVERITY_MAP:  Record<string, string>      = FORBIDDEN_DEPS.severity ?? {};
const EXEMPT_PATHS:  string[]                    = FORBIDDEN_DEPS.exemptPaths ?? [];

const HARD_SKIP_DIRS = new Set([
  "node_modules", ".git", ".pnpm", "dist", "out", "out-codex",
  ".next", ".turbo", "coverage", "cache", "cache-codex",
]);

function isExemptPath(filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, "/");
  return EXEMPT_PATHS.some(p => normalised.includes(p));
}

function checkDeps(
  deps: Record<string, string> | undefined,
  pkgFile: string,
  wsName: string,
  devOnly: boolean,
  exempt: boolean,
): DepViolation[] {
  if (!deps) return [];
  return Object.entries(deps)
    .filter(([dep]) => FORBIDDEN_SET.has(dep))
    .map(([dep, version]) => ({
      packageFile:     pkgFile,
      workspaceName:   wsName,
      dep,
      version,
      devOnly,
      ghostEquivalent: GHOST_EQUIV[dep] ?? "@ghostchain/sdk",
      severity:        SEVERITY_MAP[dep] ?? "HIGH",
      exempt,
    }));
}

// ── Walk ──────────────────────────────────────────────────────────────────────

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name !== "package.json") continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (HARD_SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else {
      // entry is package.json
      yield full;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Walk the monorepo starting at `root`, find every `package.json`,
 * and collect all violations against the forbidden-deps list.
 */
export function buildDependencyGraph(root: string): DependencyGraph {
  const violations:     DepViolation[] = [];
  const exemptedPaths:  string[]       = [];
  let   scannedManifests               = 0;

  for (const pkgFile of walk(root)) {
    let manifest: {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    try {
      manifest = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    } catch {
      continue;
    }

    scannedManifests++;
    const wsName = manifest.name ?? path.relative(root, path.dirname(pkgFile));
    const exempt  = isExemptPath(pkgFile);

    if (exempt) exemptedPaths.push(pkgFile);

    violations.push(
      ...checkDeps(manifest.dependencies,    pkgFile, wsName, false, exempt),
      ...checkDeps(manifest.devDependencies, pkgFile, wsName, true,  exempt),
    );
  }

  return { scannedManifests, violations, exemptedPaths };
}

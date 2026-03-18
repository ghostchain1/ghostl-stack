import * as fs   from "fs";
import * as path from "path";
import * as cp   from "child_process";

/**
 * BrandingGuardian — AI-layer enforcer for Ghost-native branding sovereignty.
 *
 * Scans the entire repo for legacy upstream references, rewrites them to Ghost
 * equivalents in-place, and can patch CI workflows to ensure future compliance.
 */

const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/\bERC20\b/g,    "GRC20"],
  [/\bERC721\b/g,   "GRC721"],
  [/\bERC1155\b/g,  "GRC1155"],
  [/\beth_/g,       "ghost_"],
  [/\bweb3\b/gi,    "ghostSdk"],
  [/\bethers\b/g,   "ghostSdk"],
  [/\bgwei\b/gi,    "GhostGas"],
  [/\bwei\b(?!rd)/g,"GhostUnits"],
];

const SKIP_DIRS  = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "logs"]);
const SKIP_FILES = new Set(["branding-guardian.ts", "scan.js", "ghost-registry"]);

export interface ScanResult {
  file:       string;
  violations: string[];
}

export class BrandingGuardian {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  /** Walk the repo and return all files that have branding violations. */
  scanRepo(): ScanResult[] {
    const results: ScanResult[] = [];
    this.walk(this.root, results);
    return results;
  }

  private walk(dir: string, acc: ScanResult[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) this.walk(full, acc);
        continue;
      }

      if (SKIP_FILES.has(entry.name)) continue;
      if (!/\.(ts|js|sol|json|yml|yaml|sh)$/.test(entry.name)) continue;

      const src        = fs.readFileSync(full, "utf8");
      const violations = this.detectViolations(src);
      if (violations.length > 0) acc.push({ file: full, violations });
    }
  }

  private detectViolations(src: string): string[] {
    const found: string[] = [];
    for (const [rx] of BANNED_PATTERNS) {
      const matches = src.match(new RegExp(rx.source, "gi"));
      if (matches) found.push(...[...new Set(matches)]);
    }
    return found;
  }

  /**
   * Rewrite all violations in-place across the repo.
   * Returns the number of files modified.
   */
  rewrite(): number {
    const results = this.scanRepo();
    let modified  = 0;

    for (const { file } of results) {
      let src = fs.readFileSync(file, "utf8");
      let changed = false;

      for (const [rx, replacement] of BANNED_PATTERNS) {
        const next = src.replace(new RegExp(rx.source, "g"), replacement);
        if (next !== src) { src = next; changed = true; }
      }

      if (changed) {
        fs.writeFileSync(file, src, "utf8");
        console.log(`[BrandingGuardian] Rewrote: ${path.relative(this.root, file)}`);
        modified++;
      }
    }

    return modified;
  }

  /**
   * Ensures the CI enforcement workflow exists and runs the branding scan job.
   * Adds the workflow if it is missing from the repo.
   */
  enforceCI(): void {
    const workflowDir  = path.join(this.root, ".github", "workflows");
    const workflowFile = path.join(workflowDir, "ghost-branding.yml");

    if (fs.existsSync(workflowFile)) {
      console.log("[BrandingGuardian] CI workflow already exists — checking trigger config");
      const yml = fs.readFileSync(workflowFile, "utf8");
      if (!yml.includes("node services/ghost-branding/scan.js")) {
        console.warn("[BrandingGuardian] WARNING: CI workflow may not call the branding scanner");
      } else {
        console.log("[BrandingGuardian] CI workflow is correctly configured");
      }
      return;
    }

    // Write a minimal workflow if absent
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(
      workflowFile,
      [
        "name: Ghost Branding Enforcement",
        "on: [push, pull_request]",
        "jobs:",
        "  branding-scan:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: '20'",
        "      - run: node services/ghost-branding/scan.js",
      ].join("\n"),
      "utf8"
    );
    console.log("[BrandingGuardian] Created missing CI workflow: .github/workflows/ghost-branding.yml");
  }

  /** Print a full report to stdout. */
  report(): void {
    const results = this.scanRepo();
    if (results.length === 0) {
      console.log("[BrandingGuardian] PASS — No branding violations found");
      return;
    }
    console.error(`[BrandingGuardian] FAIL — ${results.length} file(s) with violations:`);
    for (const r of results) {
      console.error(`  ${path.relative(this.root, r.file)}: ${r.violations.join(", ")}`);
    }
  }
}

// CLI usage: ts-node branding-guardian.ts [--rewrite] [--enforce-ci]
if (require.main === module) {
  const root     = path.resolve(__dirname, "../../../../");
  const guardian = new BrandingGuardian(root);
  const args     = process.argv.slice(2);

  if (args.includes("--rewrite")) {
    const n = guardian.rewrite();
    console.log(`[BrandingGuardian] Rewrote ${n} file(s)`);
  } else if (args.includes("--enforce-ci")) {
    guardian.enforceCI();
  } else {
    guardian.report();
  }
}

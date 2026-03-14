import { readFileSync, writeFileSync } from "node:fs";
import { Logger } from "@ghostchain/devkit";

const log = Logger.create("AICodeRepair");

export interface CodeRepairResult {
  file: string;
  changes: number;
  fixed: string[];
}

/** AST-free heuristic repairs for TypeScript source files. */
export class GhostAICodeRepair {
  async analyze(filePath: string): Promise<string[]> {
    const src = readFileSync(filePath, "utf8");
    const issues: string[] = [];
    if (/: any\b/.test(src))          issues.push("Found ': any' — use ': unknown' or a more specific type");
    if (/console\.log\(/.test(src))   issues.push("console.log found — use a structured logger");
    if (/var\s/.test(src))            issues.push("var declaration found — use const/let");
    if (/== null/.test(src))          issues.push("Loose null check '== null' — prefer '=== null'");
    if (/catch\s*\(\s*err\s*\)\s*\{\s*\}/.test(src)) issues.push("Empty catch block detected");
    return issues;
  }

  async repair(filePath: string): Promise<CodeRepairResult> {
    let src = readFileSync(filePath, "utf8");
    const fixed: string[] = [];

    const replacements: Array<[RegExp, string, string]> = [
      [/: any\b/g,   ": unknown", "Replaced ': any' with ': unknown'"],
      [/var\s+/g,    "const ",    "Replaced var with const"],
      [/== null\b/g, "=== null",  "Tightened null equality check"],
    ];

    for (const [re, rep, desc] of replacements) {
      const before = src;
      src = src.replace(re, rep);
      if (src !== before) fixed.push(desc);
    }

    const changes = fixed.length;
    if (changes > 0) {
      writeFileSync(filePath, src, "utf8");
      log.info(`Repaired ${filePath}: ${changes} change(s)`);
    }
    return { file: filePath, changes, fixed };
  }
}

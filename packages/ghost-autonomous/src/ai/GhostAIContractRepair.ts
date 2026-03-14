import { readFileSync, writeFileSync } from "node:fs";
import { Logger } from "@ghostchain/devkit";

const log = Logger.create("AIContractRepair");

export interface ContractRepairResult {
  file: string;
  changes: number;
  fixed: string[];
}

/** Heuristic static repair for Solidity source files. */
export class GhostAIContractRepair {
  analyze(filePath: string): string[] {
    const src = readFileSync(filePath, "utf8");
    const issues: string[] = [];
    if (/pragma\s+solidity\s+\^/.test(src))  issues.push("Floating pragma — pin to exact version");
    if (/tx\.origin/.test(src))              issues.push("tx.origin usage detected — prefer msg.sender");
    if (/selfdestruct|suicide/.test(src))    issues.push("selfdestruct/suicide — high severity");
    if (!src.includes("SPDX-License-Identifier")) issues.push("Missing SPDX-License-Identifier");
    if (/\.call\s*\{/.test(src) && !src.includes("nonReentrant")) {
      issues.push("Low-level .call without reentrancy guard");
    }
    return issues;
  }

  repair(filePath: string): ContractRepairResult {
    let src = readFileSync(filePath, "utf8");
    const fixed: string[] = [];

    // Add SPDX header if missing
    if (!src.includes("SPDX-License-Identifier")) {
      src = `// SPDX-License-Identifier: MIT\n${src}`;
      fixed.push("Added SPDX-License-Identifier: MIT");
    }

    // Warn-only: we don't rewrite tx.origin or selfdestruct automatically — too dangerous
    const issues = this.analyze(filePath);
    for (const iss of issues) {
      if (!fixed.some((f) => f === iss)) {
        log.warn(`Cannot auto-fix: ${iss}`);
      }
    }

    const changes = fixed.length;
    if (changes > 0) {
      writeFileSync(filePath, src, "utf8");
      log.info(`Repaired ${filePath}: ${changes} change(s)`);
    }
    return { file: filePath, changes, fixed };
  }
}

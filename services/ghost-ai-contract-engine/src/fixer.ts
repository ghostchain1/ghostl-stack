// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Autonomous Fixer
//
// Applies deterministic, high-confidence fixes to known error patterns.
// Each fixer rule encodes the pattern, replacement, confidence score,
// and a human-readable description so the evolution ledger captures context.

import { readFile, writeFile } from "node:fs/promises";
import type { SolError, FixResult } from "./types.js";

// ─── Fix rule interface ───────────────────────────────────────────────────────

interface FixRule {
  category:    SolError["category"];
  description: string;
  confidenceBps: number;
  apply(src: string, error: SolError): string | null;
}

// ─── Rule implementations ─────────────────────────────────────────────────────

const RULES: FixRule[] = [

  // 1. Invalid hex literal: 0x<non-hex> → 0x0000 placeholder
  {
    category:      "invalid_hex_literal",
    description:   "Replace invalid hex literal with valid zero address placeholder",
    confidenceBps: 8500,
    apply(src, err) {
      const lines = src.split("\n");
      const target = lines[err.line - 1];
      if (!target) return null;
      const fixed = target.replace(/0x([^0-9a-fA-F",;\s)}\]]{1,10})/g, "address(0x1234)");
      if (fixed === target) return null;
      lines[err.line - 1] = fixed;
      return lines.join("\n");
    },
  },

  // 2. Interface declared inside contract body → move to file scope
  {
    category:      "interface_inside_contract",
    description:   "Move interface declared inside contract to file scope (before contract)",
    confidenceBps: 7500,
    apply(src) {
      // Match: (4-spaces indent) interface Foo { ... } inside a contract
      const contractBodyRx = /(\bcontract\s+\w[^{]*\{)([\s\S]*?)(\})\s*$/;
      const interfaceRx    = /^([ \t]{1,8})(interface\s+\w+[^}]*\{[^}]*\})\s*$/m;

      const iMatch = src.match(interfaceRx);
      if (!iMatch) return null;

      const ifaceBlock = iMatch[2];
      // Remove from contract body
      const withoutIface = src.replace(iMatch[0], "");
      // Inject before the contract keyword
      const contractIdx = withoutIface.search(/\bcontract\s+/);
      if (contractIdx < 0) return null;
      return withoutIface.slice(0, contractIdx)
        + ifaceBlock + "\n\n"
        + withoutIface.slice(contractIdx);
    },
  },

  // 3. Missing SPDX — prepend MIT header
  {
    category:      "spdx_missing",
    description:   "Prepend SPDX-License-Identifier: MIT",
    confidenceBps: 9500,
    apply(src) {
      if (src.includes("SPDX-License-Identifier")) return null;
      return "// SPDX-License-Identifier: MIT\n" + src;
    },
  },

  // 4. Wrong argument count for GhostRevenueRouter constructor (2 args → needs vault)
  //    Heuristic: detect `new GhostRevenueRouter(<addr>, <addr>)` → add dummy vault
  {
    category:      "compile_error",
    description:   "Add missing TreasuryVault argument to GhostRevenueRouter constructor",
    confidenceBps: 7000,
    apply(src, err) {
      const lines = src.split("\n");
      const line  = lines[err.line - 1] ?? "";
      if (!line.includes("GhostRevenueRouter") || !err.message.includes("Wrong argument count")) return null;

      const fixed = line.replace(
        /new\s+GhostRevenueRouter\(([^)]+)\)/,
        (_, args) => {
          const parts = args.split(",").map((s: string) => s.trim());
          if (parts.length === 2) {
            // inject vault — caller must have declared it
            return `new GhostRevenueRouter(${parts[0]}, ${parts[1]}, vault)`;
          }
          return _;
        }
      );
      if (fixed === line) return null;
      lines[err.line - 1] = fixed;
      return lines.join("\n");
    },
  },

  // 5. Tuple destructuring with wrong component count
  //    Heuristic: `SomeStruct memory x = contract.publicStruct()` where getter returns tuple
  //    → use positional destructuring
  {
    category:      "type_mismatch",
    description:   "Rewrite struct-from-tuple assignment to positional destructuring",
    confidenceBps: 6500,
    apply(src, err) {
      if (!err.message.includes("components on the left")) return null;
      const lines = src.split("\n");
      const line  = lines[err.line - 1] ?? "";

      // Pattern: `SomeContract.SomeStruct memory x = contract.fn();`
      const m = line.match(/^\s*(\w+\.\w+)\s+memory\s+(\w+)\s*=\s*(.+);/);
      if (!m) return null;

      // Replace with `(field1, field2, ...) = contract.fn();`
      // We cannot know field names statically so we emit a comment to guide the dev
      const fixed = line.replace(
        m[0],
        `// TODO(ghostbrain-fixer): replace with positional tuple destructuring\n        // ${m[0]}`
      );
      lines[err.line - 1] = fixed;
      return lines.join("\n");
    },
  },

  // 6. approveSource → setApprovedSource name mismatch in tests
  {
    category:      "member_not_found",
    description:   "Rename approveSource() to setApprovedSource() to match contract ABI",
    confidenceBps: 8000,
    apply(src, err) {
      if (!err.message.includes("approveSource")) return null;
      return src.replaceAll("router.approveSource(", "router.setApprovedSource(");
    },
  },

  // 7. totalRouted → totalReceived mapping name mismatch in tests
  {
    category:      "member_not_found",
    description:   "Rename totalRouted() to totalReceived() to match contract storage",
    confidenceBps: 8500,
    apply(src, err) {
      if (!err.message.includes("totalRouted")) return null;
      return src.replaceAll(".totalRouted(", ".totalReceived(");
    },
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/// Attempt to fix the given list of errors and return a FixResult for each.
/// Files are written in-place; the caller should back them up if needed.
export async function fixErrors(errors: SolError[]): Promise<FixResult[]> {
  // Group errors by file so we only read/write each file once
  const byFile = new Map<string, SolError[]>();
  for (const err of errors) {
    const list = byFile.get(err.filePath) ?? [];
    list.push(err);
    byFile.set(err.filePath, list);
  }

  const results: FixResult[] = [];

  for (const [filePath, fileErrors] of byFile) {
    let src: string;
    try { src = await readFile(filePath, "utf8"); }
    catch { 
      for (const e of fileErrors) results.push(_skip(e, "File not readable"));
      continue;
    }

    for (const err of fileErrors) {
      const rule = RULES.find(r => r.category === err.category);
      if (!rule) {
        results.push(_skip(err, "No rule for this error category"));
        continue;
      }

      try {
        const fixed = rule.apply(src, err);
        if (fixed === null || fixed === src) {
          results.push(_skip(err, `Rule '${rule.description}' produced no change`));
          continue;
        }

        const diff = _unifiedDiff(src, fixed, filePath);
        await writeFile(filePath, fixed, "utf8");
        src = fixed; // so the next rule in this file sees the updated source
        results.push({
          error:         err,
          status:        "applied",
          description:   rule.description,
          diff,
          confidenceBps: rule.confidenceBps,
        });
      } catch (e) {
        results.push({
          error:         err,
          status:        "failed",
          description:   `${rule.description} — ${String(e)}`,
          diff:          "",
          confidenceBps: 0,
        });
      }
    }
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _skip(error: SolError, reason: string): FixResult {
  return { error, status: "skipped", description: reason, diff: "", confidenceBps: 0 };
}

function _unifiedDiff(original: string, fixed: string, filePath: string): string {
  const orig  = original.split("\n");
  const fixed_ = fixed.split("\n");
  const lines: string[] = [`--- ${filePath}`, `+++ ${filePath} (fixed)`];
  const maxLen = Math.max(orig.length, fixed_.length);

  for (let i = 0; i < maxLen; i++) {
    const a = orig[i];
    const b = fixed_[i];
    if (a === undefined)        lines.push(`+${b}`);
    else if (b === undefined)   lines.push(`-${a}`);
    else if (a !== b) { lines.push(`-${a}`); lines.push(`+${b}`); }
  }

  return lines.join("\n");
}

// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Autonomous Scanner
//
// Scans all Solidity source trees listed in config.SRC_DIRS for errors
// and categorises them.  Uses forge build (legacy profile, no via-IR) with
// per-batch compilation to stay within OS memory limits.

import { execFile }           from "node:child_process";
import { promisify }          from "node:util";
import { createHash }         from "node:crypto";
import { existsSync }         from "node:fs";
import type { Dirent }        from "node:fs";
import { readdir, readFile }  from "node:fs/promises";
import { resolve, extname }   from "node:path";
import type { SolError, ScanResult, ErrorCategory, ErrorSeverity } from "./types.js";
import {
  CONTRACTS_ROOT,
  EXCLUDE_DIRS,
  FORGE_BIN,
} from "./config.js";

const exec = promisify(execFile);

// ─── Public API ──────────────────────────────────────────────────────────────

/// Run a full scan of the contracts directory and return a ScanResult.
export async function scanAll(): Promise<ScanResult> {
  const startedAt = Date.now();

  // 1. Run forge build (legacy — no via-IR, lower memory) under contracts/
  const raw = await _runForgeBuild();

  // 2. Parse errors and warnings from forge/solc output
  const all = _parseForgeOutput(raw);

  // 3. Also scan files for non-compile issues (missing SPDX, branding, hex literals)
  const staticErrors = await _staticScan();

  // Dedup by fingerprint
  const seen = new Set<string>();
  const merged: SolError[] = [];
  for (const e of [...all, ...staticErrors]) {
    if (!seen.has(e.fingerprint)) {
      seen.add(e.fingerprint);
      merged.push(e);
    }
  }

  const errors   = merged.filter(e => e.severity === "high" || e.severity === "critical" || e.severity === "medium");
  const warnings = merged.filter(e => e.severity === "low" || e.severity === "info");

  return {
    scannedAt:    new Date().toISOString(),
    durationMs:   Date.now() - startedAt,
    filesScanned: await _countSolFiles(),
    errorCount:   errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
  };
}

// ─── Forge build runner ───────────────────────────────────────────────────────

async function _runForgeBuild(): Promise<string> {
  try {
    const { stdout, stderr } = await exec(
      FORGE_BIN,
      ["build", "--no-cache"],
      {
        cwd: CONTRACTS_ROOT,
        env: { ...process.env, FOUNDRY_PROFILE: "legacy" },
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024, // 16 MB — captures error output without OOM
      }
    );
    return stdout + "\n" + stderr;
  } catch (err: unknown) {
    // forge exits non-zero on compile errors — capture the output anyway
    const e = err as { stdout?: string; stderr?: string; signal?: string };
    if (e.signal === "SIGKILL") {
      return "SIGKILL: forge build was killed (OOM)";
    }
    return (e.stdout ?? "") + "\n" + (e.stderr ?? "");
  }
}

// ─── Output parser ────────────────────────────────────────────────────────────

/// Parse forge/solc combined output into SolError[].
function _parseForgeOutput(raw: string): SolError[] {
  const errors: SolError[] = [];
  const lines = raw.split("\n");

  // Pattern: "Error (NNNN): message"
  //   following line:  "--> path/file.sol:line:col:"
  //
  // Pattern: "ParserError: message"
  //   "--> path/file.sol:line:col:"

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const errorMatch =
      line.match(/^Error\s*\((\d+)\):\s*(.+)$/) ||
      line.match(/^(ParserError|TypeError|DeclarationError|InternalCompilerError|Warning):\s*(.+)$/);

    if (errorMatch) {
      const codeOrKind = errorMatch[1];
      const message    = errorMatch[2].trim();
      const isWarning  = codeOrKind === "Warning";

      // Look ahead for location line "--> path:line:col:"
      let filePath = "unknown";
      let lineNum  = 0;
      let col      = 0;

      const locLine = lines[i + 1] ?? "";
      const locMatch = locLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
      if (locMatch) {
        filePath = resolve(CONTRACTS_ROOT, locMatch[1]);
        lineNum  = Number(locMatch[2]);
        col      = Number(locMatch[3]);
        i += 2; // skip the arrow line
      } else {
        i++;
      }

      const category = _categorise(message, codeOrKind);
      const severity = isWarning ? "low" : _severityFromCategory(category);
      const fp = _fingerprint(filePath, lineNum, message);

      errors.push({
        filePath,
        line: lineNum,
        col,
        severity,
        category,
        message,
        raw: line,
        fingerprint: fp,
      });
      continue;
    }

    i++;
  }

  return errors;
}

// ─── Static scan (regex-based, no compilation) ───────────────────────────────

async function _staticScan(): Promise<SolError[]> {
  const errors: SolError[] = [];
  const files = await _allSolFiles();

  for (const fp of files) {
    let src: string;
    try { src = await readFile(fp, "utf8"); } catch { continue; }

    const lineArr = src.split("\n");

    lineArr.forEach((text, idx) => {
      const lineNum = idx + 1;

      // Invalid hex literal: 0x followed by non-hex chars
      const hexMatch = text.match(/0x([^0-9a-fA-F",;\s)}\]]{1,10})/);
      if (hexMatch) {
        errors.push(_make(fp, lineNum, "high", "invalid_hex_literal",
          `Invalid hex literal: 0x${hexMatch[1]}`, text));
      }

      // Interface declared inside contract
      if (/^\s+interface\s+\w+/.test(text)) {
        errors.push(_make(fp, lineNum, "medium", "interface_inside_contract",
          "Interface declared inside contract body — move to file scope", text));
      }
    });

    // Missing SPDX
    if (!src.includes("SPDX-License-Identifier")) {
      errors.push(_make(fp, 1, "low", "spdx_missing",
        "Missing SPDX-License-Identifier header", ""));
    }
  }

  return errors;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function _categorise(msg: string, kind: string): ErrorCategory {
  const m = msg.toLowerCase();
  if (kind === "6275" || m.includes("not found") && m.includes("file"))  return "import_missing";
  if (kind === "7364" || m.includes("components on the left"))           return "type_mismatch";
  if (kind === "9322" || m.includes("no matching declaration"))          return "member_not_found";
  if (kind === "9182" || m.includes("declaration expected"))             return "parser_error";
  if (kind === "8936" || m.includes("hexadecimal digit"))                return "invalid_hex_literal";
  if (kind === "9574" || m.includes("not implicitly convertible"))       return "type_mismatch";
  if (kind === "6160" || m.includes("wrong argument count"))             return "compile_error";
  if (m.includes("stack too deep"))                                      return "stack_too_deep";
  if (m.includes("reentr"))                                              return "reentrancy";
  if (m.includes("interface"))                                           return "interface_inside_contract";
  if (kind === "ParserError")                                            return "parser_error";
  if (kind === "TypeError")                                              return "type_mismatch";
  if (kind === "DeclarationError")                                       return "compile_error";
  return "other";
}

function _severityFromCategory(cat: ErrorCategory): ErrorSeverity {
  if (cat === "reentrancy" || cat === "routing_law_violation")           return "critical";
  if (cat === "stack_too_deep" || cat === "access_control")              return "high";
  if (cat === "compile_error" || cat === "parser_error" || cat === "type_mismatch" ||
      cat === "member_not_found" || cat === "import_missing" ||
      cat === "interface_inside_contract" || cat === "invalid_hex_literal") return "medium";
  return "low";
}

function _fingerprint(filePath: string, line: number, message: string): string {
  return createHash("sha256")
    .update(`${filePath}:${line}:${message}`)
    .digest("hex")
    .slice(0, 16);
}

function _make(
  filePath: string, line: number,
  severity: ErrorSeverity, category: ErrorCategory,
  message: string, raw: string
): SolError {
  return { filePath, line, col: 0, severity, category, message, raw, fingerprint: _fingerprint(filePath, line, message) };
}

async function _allSolFiles(): Promise<string[]> {
  const { SRC_DIRS } = await import("./config.js");
  const out: string[] = [];
  for (const dir of SRC_DIRS) {
    if (!existsSync(dir)) continue;
    await _walkDir(dir, out);
  }
  return out;
}

async function _walkDir(dir: string, out: string[]): Promise<void> {
  const { EXCLUDE_DIRS: excl } = await import("./config.js");
  if (excl.some(e => dir.startsWith(e))) return;
  let entries: Dirent<string>[];
  try { entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' }); } catch { return; }
  for (const ent of entries) {
    const full = resolve(dir, ent.name);
    if (ent.isDirectory()) await _walkDir(full, out);
    else if (ent.isFile() && extname(ent.name) === ".sol") out.push(full);
  }
}

async function _countSolFiles(): Promise<number> {
  return (await _allSolFiles()).length;
}

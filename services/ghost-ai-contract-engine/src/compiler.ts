// SPDX-License-Identifier: MIT
// GhostChain · GhostBrain AI Contract Engine — Low-Memory Compiler
//
// Strategy for low-memory compilation:
//   1. Attempt full `forge build` with `FOUNDRY_PROFILE=legacy` (no via-IR)
//   2. If SIGKILL (OOM), split work: compile only `src/` (production contracts)
//      without test files, which require less memory
//   3. If still OOM, fall back to per-directory compilation to find which
//      subset is the culprit
//   4. Return a CompileResult with aggregate stats + stdout/stderr

import { execFile }  from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readdir }   from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve }   from "node:path";
import type { CompileResult, CompileStatus } from "./types.js";
import { CONTRACTS_ROOT, FORGE_BIN } from "./config.js";

const exec = promisify(execFile);

// ─── Public API ───────────────────────────────────────────────────────────────

/// Run the compilation pipeline, returning a CompileResult.
/// Uses progressively more targeted compilation to stay within memory limits.
export async function compile(): Promise<CompileResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // Try 1: full legacy build (no via-IR)
  const r1 = await _forgeBuild("legacy", []);

  if (r1.status === "pass" || r1.status === "fail") {
    return _result(startedAt, t0, r1);
  }

  // OOM — Try 2: compile production src/ only (skip test/, compliance/)
  console.warn("[compiler] Full build OOM — trying src-only build");
  const r2 = await _forgeSrcOnly();

  if (r2.status === "pass" || r2.status === "fail") {
    return _result(startedAt, t0, r2);
  }

  // Still OOM — return status so the engine can report it
  console.error("[compiler] src-only build also OOM — reporting oom status");
  return _result(startedAt, t0, r2);
}

/// Run compilation and return true iff there are zero errors.
export async function compileAndCheck(): Promise<boolean> {
  const result = await compile();
  return result.status === "pass";
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface RawResult {
  status:  CompileStatus;
  stdout:  string;
  stderr:  string;
  errors:  number;
  warnings: number;
  files:   number;
}

async function _forgeBuild(profile: string, extraArgs: string[]): Promise<RawResult> {
  try {
    const { stdout, stderr } = await exec(
      FORGE_BIN,
      ["build", ...extraArgs],
      {
        cwd: CONTRACTS_ROOT,
        env: { ...process.env, FOUNDRY_PROFILE: profile },
        timeout: 180_000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    const combined = stdout + "\n" + stderr;
    return {
      status:   "pass",
      stdout,
      stderr,
      errors:   _countPattern(combined, /^Error/gm),
      warnings: _countPattern(combined, /^Warning/gm),
      files:    _countPattern(combined, /\.sol$/gm),
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; signal?: string; code?: number };

    if (e.signal === "SIGKILL") {
      return { status: "oom", stdout: e.stdout ?? "", stderr: e.stderr ?? "", errors: 0, warnings: 0, files: 0 };
    }

    const combined = (e.stdout ?? "") + "\n" + (e.stderr ?? "");
    return {
      status:   "fail",
      stdout:   e.stdout ?? "",
      stderr:   e.stderr ?? "",
      errors:   _countPattern(combined, /^Error/gm),
      warnings: _countPattern(combined, /^Warning/gm),
      files:    _countPattern(combined, /\.sol$/gm),
    };
  }
}

/// Compile only production source files (no tests, no compliance) to reduce memory.
async function _forgeSrcOnly(): Promise<RawResult> {
  // forge build with --match-path pattern — only compile src/**
  return _forgeBuild("legacy", ["--skip", "test"]);
}

function _result(startedAt: string, t0: number, raw: RawResult): CompileResult {
  const aggregateBytecodeHash = _buildAggregateHash(raw.stdout);
  return {
    startedAt,
    finishedAt:    new Date().toISOString(),
    durationMs:    Date.now() - t0,
    status:        raw.status,
    filesCompiled: raw.files,
    errorCount:    raw.errors,
    warningCount:  raw.warnings,
    stdout:        raw.stdout.slice(0, 8192),  // cap to avoid memory bloat
    stderr:        raw.stderr.slice(0, 8192),
    aggregateBytecodeHash,
  };
}

function _countPattern(text: string, rx: RegExp): number {
  return (text.match(rx) ?? []).length;
}

/// Derive a lightweight aggregate hash from the forge build output lines
/// that contain "Bytecode" or contract artifact paths.
function _buildAggregateHash(stdout: string): string {
  const lines = stdout.split("\n")
    .filter(l => l.includes(".sol") || l.includes("Bytecode"))
    .join("\n");
  return createHash("sha256").update(lines).digest("hex").slice(0, 32);
}

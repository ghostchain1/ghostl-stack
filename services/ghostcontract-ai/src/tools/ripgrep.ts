/**
 * GhostContractAI — ripgrep Tool
 *
 * Narrow, streaming search over the contracts directory.
 * Never loads entire repo into memory; queries ripgrep subprocess.
 */

import { spawn } from "node:child_process";
import path from "node:path";

export interface RipgrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}

export interface RipgrepOptions {
  cwd?: string;
  maxCount?: number;          // --max-count per file
  maxMatches?: number;        // total match limit (safety cap)
  fileGlob?: string;          // --glob pattern (e.g., "*.sol")
  timeoutMs?: number;
  ignoreCase?: boolean;
}

const DEFAULT_MAX = 200;
const DEFAULT_TIMEOUT = 30_000;

/**
 * Run a ripgrep search. Returns up to maxMatches results.
 * rg must be installed in the container/host.
 */
export async function ripgrepSearch(
  pattern: string,
  searchRoot: string,
  opts: RipgrepOptions = {},
): Promise<RipgrepMatch[]> {
  const {
    maxCount = 20,
    maxMatches = DEFAULT_MAX,
    fileGlob,
    timeoutMs = DEFAULT_TIMEOUT,
    ignoreCase = false,
  } = opts;

  const args: string[] = [
    "--line-number",
    "--no-heading",
    "--color=never",
    `--max-count=${maxCount}`,
  ];

  if (ignoreCase) args.push("--ignore-case");
  if (fileGlob) args.push("--glob", fileGlob);

  args.push(pattern, searchRoot);

  const matches: RipgrepMatch[] = [];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("rg", args, {
      cwd: opts.cwd ?? searchRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (matches.length >= maxMatches) {
          proc.kill("SIGTERM");
          break;
        }
        const m = _parseLine(line);
        if (m) matches.push(m);
      }
    });

    proc.on("close", () => {
      clearTimeout(timer);
      // parse remaining buffer
      if (buffer.trim()) {
        const m = _parseLine(buffer.trim());
        if (m && matches.length < maxMatches) matches.push(m);
      }
      resolve();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      // If rg not installed, resolve empty rather than crashing
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        resolve();
      } else {
        reject(err);
      }
    });
  });

  return matches;
}

/**
 * Find Solidity files in a root directory.
 * Returns relative paths from searchRoot.
 */
export async function findSolFiles(
  searchRoot: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<string[]> {
  const files: string[] = [];
  await new Promise<void>((resolve) => {
    const proc = spawn("rg", ["--files", "--glob", "*.sol", searchRoot], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stdout.on("data", (d: Buffer) => (buf += d.toString("utf8")));
    proc.on("close", () => {
      clearTimeout(timer);
      for (const line of buf.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) files.push(trimmed);
      }
      resolve();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return files;
}

function _parseLine(line: string): RipgrepMatch | null {
  // Format: filepath:linenum:content
  const idx1 = line.indexOf(":");
  if (idx1 < 0) return null;
  const idx2 = line.indexOf(":", idx1 + 1);
  if (idx2 < 0) return null;
  const filePath = line.slice(0, idx1);
  const lineNumber = parseInt(line.slice(idx1 + 1, idx2), 10);
  const text = line.slice(idx2 + 1);
  if (isNaN(lineNumber)) return null;
  return { filePath, lineNumber, line: text };
}

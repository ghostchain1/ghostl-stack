/**
 * GhostContractAI — Foundry Tool
 *
 * Spawns forge/cast child processes with strict resource limits.
 * Concurrency bounded to 1 (or 2 max) per config.
 */

import { spawn } from "node:child_process";
import { FOUNDRY_PROFILE, CONTRACTS_DIR } from "../config.js";

export interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// ─── Low-level runner ─────────────────────────────────────────────────────────

export function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<CmdResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        FOUNDRY_PROFILE: FOUNDRY_PROFILE,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const MAX_OUTPUT = 512_000; // 512 KB per stream cap
    proc.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString("utf8");
    });
    proc.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString("utf8");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: stderr + `\nProcess error: ${err.message}`,
        timedOut,
      });
    });
  });
}

// ─── Forge commands ───────────────────────────────────────────────────────────

export async function forgeBuild(
  repoRoot: string,
  timeoutMs: number,
  profile = "default",
  extraArgs: string[] = [],
): Promise<CmdResult> {
  return runCmd(
    "forge",
    ["build", "--sizes", "--profile", profile, ...extraArgs],
    repoRoot,
    timeoutMs,
  );
}

export async function forgeTest(
  repoRoot: string,
  timeoutMs: number,
  profile = "default",
  matchPath?: string,
  extraArgs: string[] = [],
): Promise<CmdResult> {
  const args = ["test", "-vvv", "--profile", profile];
  if (matchPath) args.push("--match-path", matchPath);
  args.push(...extraArgs);
  return runCmd("forge", args, repoRoot, timeoutMs);
}

export async function forgeInspect(
  repoRoot: string,
  contractName: string,
  field: "storageLayout" | "abi" | "bytecode",
  timeoutMs: number,
): Promise<CmdResult> {
  return runCmd(
    "forge",
    ["inspect", contractName, field, "--json"],
    repoRoot,
    timeoutMs,
  );
}

export async function forgeVersion(timeoutMs = 10_000): Promise<string> {
  const r = await runCmd("forge", ["--version"], process.cwd(), timeoutMs);
  return r.stdout.trim() || r.stderr.trim() || "unknown";
}

// ─── Concurrency semaphore ────────────────────────────────────────────────────

let _active = 0;
const _MAX = Number(process.env.GHOSTAI_FORGE_CONCURRENCY ?? 1);

export async function withForgeSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  if (_active >= _MAX) {
    throw new Error(
      `Forge concurrency limit reached (max=${_MAX}). Retry later.`,
    );
  }
  _active++;
  try {
    return await fn();
  } finally {
    _active--;
  }
}

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RunOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Timeout in ms (0 = no timeout) */
  timeoutMs?: number;
  /** If true, stream stdout/stderr to process.stdout/stderr */
  stream?: boolean;
  /** If true, suppress streaming even when stream=true */
  silent?: boolean;
  /** Signal to send on timeout */
  killSignal?: NodeJS.Signals;
}

export class ProcessRunner {
  static async run(
    cmd: string,
    args: string[] = [],
    options: RunOptions = {},
  ): Promise<RunResult> {
    const {
      cwd         = process.cwd(),
      env         = {},
      timeoutMs   = 0,
      stream      = false,
      silent      = false,
      killSignal  = "SIGTERM",
    } = options;

    return new Promise<RunResult>((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        cwd,
        env: { ...process.env, ...env },
        shell: false,
      };

      const child: ChildProcess = spawn(cmd, args, spawnOpts);

      let stdout = "";
      let stderr = "";
      let timer: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          child.kill(killSignal);
        }, timeoutMs);
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        const s = chunk.toString();
        stdout += s;
        if (stream && !silent) process.stdout.write(s);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const s = chunk.toString();
        stderr += s;
        if (stream && !silent) process.stderr.write(s);
      });

      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(new Error(`Process error: ${err.message}`));
      });

      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Process timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
          return;
        }
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }

  /** Run and throw if exit code != 0 */
  static async exec(
    cmd: string,
    args: string[] = [],
    options: RunOptions = {},
  ): Promise<string> {
    const result = await ProcessRunner.run(cmd, args, { stream: true, ...options });
    if (result.code !== 0) {
      throw new Error(
        `Command failed (exit ${result.code}): ${cmd} ${args.join(" ")}\n${result.stderr}`,
      );
    }
    return result.stdout;
  }

  /** Split a shell string into cmd + args safely (no shell=true) */
  static parseCmd(shellStr: string): [string, string[]] {
    const parts = shellStr.trim().split(/\s+/);
    return [parts[0] ?? "", parts.slice(1)];
  }

  /** Convenience: run a full shell string */
  static async shell(shellStr: string, options: RunOptions = {}): Promise<string> {
    const [cmd, args] = ProcessRunner.parseCmd(shellStr);
    return ProcessRunner.exec(cmd, args, options);
  }
}

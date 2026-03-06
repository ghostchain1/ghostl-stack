import { spawn } from "node:child_process";
export class ProcessRunner {
    static async run(cmd, args = [], options = {}) {
        const { cwd = process.cwd(), env = {}, timeoutMs = 0, stream = false, silent = false, killSignal = "SIGTERM", } = options;
        return new Promise((resolve, reject) => {
            const spawnOpts = {
                cwd,
                env: { ...process.env, ...env },
                shell: false,
            };
            const child = spawn(cmd, args, spawnOpts);
            let stdout = "";
            let stderr = "";
            let timer = null;
            let timedOut = false;
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    child.kill(killSignal);
                }, timeoutMs);
            }
            child.stdout?.on("data", (chunk) => {
                const s = chunk.toString();
                stdout += s;
                if (stream && !silent)
                    process.stdout.write(s);
            });
            child.stderr?.on("data", (chunk) => {
                const s = chunk.toString();
                stderr += s;
                if (stream && !silent)
                    process.stderr.write(s);
            });
            child.on("error", (err) => {
                if (timer)
                    clearTimeout(timer);
                reject(new Error(`Process error: ${err.message}`));
            });
            child.on("close", (code) => {
                if (timer)
                    clearTimeout(timer);
                if (timedOut) {
                    reject(new Error(`Process timed out after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
                    return;
                }
                resolve({ stdout, stderr, code: code ?? 1 });
            });
        });
    }
    /** Run and throw if exit code != 0 */
    static async exec(cmd, args = [], options = {}) {
        const result = await ProcessRunner.run(cmd, args, { stream: true, ...options });
        if (result.code !== 0) {
            throw new Error(`Command failed (exit ${result.code}): ${cmd} ${args.join(" ")}\n${result.stderr}`);
        }
        return result.stdout;
    }
    /** Split a shell string into cmd + args safely (no shell=true) */
    static parseCmd(shellStr) {
        const parts = shellStr.trim().split(/\s+/);
        return [parts[0] ?? "", parts.slice(1)];
    }
    /** Convenience: run a full shell string */
    static async shell(shellStr, options = {}) {
        const [cmd, args] = ProcessRunner.parseCmd(shellStr);
        return ProcessRunner.exec(cmd, args, options);
    }
}

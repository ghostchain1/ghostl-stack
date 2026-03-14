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
export declare class ProcessRunner {
    static run(cmd: string, args?: string[], options?: RunOptions): Promise<RunResult>;
    /** Run and throw if exit code != 0 */
    static exec(cmd: string, args?: string[], options?: RunOptions): Promise<string>;
    /** Split a shell string into cmd + args safely (no shell=true) */
    static parseCmd(shellStr: string): [string, string[]];
    /** Convenience: run a full shell string */
    static shell(shellStr: string, options?: RunOptions): Promise<string>;
}
//# sourceMappingURL=ProcessRunner.d.ts.map
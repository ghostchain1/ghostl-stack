export interface CLIContext {
    args: string[];
    flags: Record<string, string | boolean>;
    raw: string[];
}
export declare function parseArgs(argv: string[]): CLIContext;
export declare class GhostCLI {
    run(argv?: string[]): Promise<void>;
}
//# sourceMappingURL=GhostCLI.d.ts.map
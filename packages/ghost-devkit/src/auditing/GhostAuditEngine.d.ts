export interface AuditFileResult {
    file: string;
    issues: string[];
}
export declare class GhostAuditEngine {
    private readonly auditor;
    /** Recursively audit all .sol files in `dir`. */
    run(dir: string): Promise<AuditFileResult[]>;
    private findSolFiles;
}
//# sourceMappingURL=GhostAuditEngine.d.ts.map
import type { AuditFileResult } from "./GhostAuditEngine.js";
export interface AuditSummary {
    scannedFiles: number;
    filesWithIssues: number;
    totalIssues: number;
    generatedAt: string;
    results: AuditFileResult[];
}
export declare class GhostAuditReport {
    /** Generate a JSON-serialised audit report string. */
    generate(results: AuditFileResult[]): string;
    /** Print a human-readable version to stdout. */
    print(results: AuditFileResult[]): void;
}
//# sourceMappingURL=GhostAuditReport.d.ts.map
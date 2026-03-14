/** A simple, dependency-free static analyser for Solidity source files. */
export declare class GhostAIContractAuditor {
    /** Returns a list of issue strings found in the Solidity source. */
    analyze(source: string): string[];
    analyzeFile(filePath: string): string[];
    private check;
}
//# sourceMappingURL=GhostAIContractAuditor.d.ts.map
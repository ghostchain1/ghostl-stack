export declare class GhostContractTemplate {
    /** Solidity source for a minimal ownable contract. */
    generate(name: string): string;
    /** Foundry test template. */
    generateTest(name: string): string;
    /** Foundry broadcast script template. */
    generateScript(name: string): string;
    static readonly GITIGNORE = "# Foundry artifacts\ncontracts/out/\ncontracts/cache/\n\n# Node\nnode_modules/\ndist/\n\n# Secrets\n.env\n*.env\nprivate_key.txt\n";
}
//# sourceMappingURL=GhostContractTemplate.d.ts.map
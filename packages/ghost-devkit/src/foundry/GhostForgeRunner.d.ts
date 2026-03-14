export interface ForgeRunOptions {
    profile?: string;
    matchPath?: string;
    matchTest?: string;
    verbosity?: number;
    gasReport?: boolean;
    forkUrl?: string;
    forkBlock?: number;
}
export declare class GhostForgeRunner {
    private projectRoot;
    constructor(projectRoot?: string);
    static create(): Promise<GhostForgeRunner>;
    build(profile?: string): Promise<void>;
    test(opts?: ForgeRunOptions): Promise<void>;
    script(scriptPath: string, rpcUrl: string, broadcast?: boolean, pk?: string): Promise<void>;
    verify(address: string, contract: string, chainId: number, apiKey: string): Promise<void>;
}
//# sourceMappingURL=GhostForgeRunner.d.ts.map
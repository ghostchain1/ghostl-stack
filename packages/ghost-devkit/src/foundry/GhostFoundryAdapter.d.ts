import { type RunOptions } from "../utils/ProcessRunner.js";
export interface FoundryAdapterOptions {
    projectRoot?: string;
}
export declare class GhostFoundryAdapter {
    private projectRoot;
    constructor(opts?: FoundryAdapterOptions);
    static create(): Promise<GhostFoundryAdapter>;
    protected runOpts(extra?: Partial<RunOptions>): RunOptions;
    version(): Promise<string>;
    build(profile?: string): Promise<void>;
    test(matchPath?: string, verbosity?: number): Promise<void>;
    clean(): Promise<void>;
    snapshot(): Promise<void>;
    coverage(): Promise<void>;
}
//# sourceMappingURL=GhostFoundryAdapter.d.ts.map
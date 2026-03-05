export interface GhostConfig {
    /** Active network: l1 | l2 | l3 */
    network: "l1" | "l2" | "l3";
    /** RPC endpoints keyed by layer */
    rpc: {
        l1: string;
        l2: string;
        l3: string;
    };
    /** Deployment configuration */
    deployment: {
        confirmations: number;
        gasMultiplier: number;
    };
    /** Foundry paths */
    foundry: {
        projectRoot: string;
        outDir: string;
        scriptDir: string;
    };
    /** Validator settings */
    validator: {
        minPeers: number;
        restartOnLowPeers: boolean;
    };
    /** GhostBrain API endpoint */
    ghostbrainUrl: string;
    /** Custom fields */
    [key: string]: unknown;
}
export declare class ConfigLoader {
    private readonly configPath;
    private static instance;
    private config;
    private loaded;
    private constructor();
    static getInstance(root?: string): ConfigLoader;
    /** Reset singleton (for testing) */
    static reset(): void;
    load(): Promise<GhostConfig>;
    get<K extends keyof GhostConfig>(key: K): GhostConfig[K];
    private merge;
    static loadFrom(root?: string): Promise<GhostConfig>;
}
//# sourceMappingURL=ConfigLoader.d.ts.map
export interface GenerateOptions {
    name?: string;
    network?: string;
    overwrite?: boolean;
}
export declare class GhostProjectGenerator {
    private readonly tpl;
    create(dir: string, opts?: GenerateOptions): Promise<void>;
    private foundryToml;
    private ghostConfig;
}
//# sourceMappingURL=GhostProjectGenerator.d.ts.map
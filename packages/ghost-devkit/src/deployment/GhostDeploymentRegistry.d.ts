export interface RegistryEntry {
    name: string;
    address: string;
    network: string;
    timestamp: string;
}
export declare class GhostDeploymentRegistry {
    private readonly entries;
    private readonly filePath;
    constructor(filePath?: string);
    private load;
    private key;
    register(name: string, address: string, network?: string): void;
    get(name: string, network?: string): RegistryEntry | undefined;
    getAddress(name: string, network?: string): string | undefined;
    list(network?: string): RegistryEntry[];
    export(): string;
    private persist;
}
//# sourceMappingURL=GhostDeploymentRegistry.d.ts.map
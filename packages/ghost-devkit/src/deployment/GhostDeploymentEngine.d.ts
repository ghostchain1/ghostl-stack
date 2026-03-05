import { GhostDeploymentRegistry } from "./GhostDeploymentRegistry.js";
export interface DeploymentEngineOptions {
    rpcUrl: string;
    confirmations?: number;
    privateKey?: string;
    gasLimit?: string;
    verifyApiKey?: string;
    slow?: boolean;
}
export interface DeployResult {
    contract: string;
    network: string;
    address?: string;
    txHash?: string;
    success: boolean;
    error?: string;
}
export declare class GhostDeploymentEngine {
    private readonly rpcUrl;
    private readonly confirmations;
    private readonly privateKey;
    private readonly gasLimit;
    private readonly verifyApiKey;
    private readonly slow;
    private readonly registry;
    constructor(opts: DeploymentEngineOptions);
    /** Deploy a named contract via `forge create`. */
    deploy(contract: string, network: string): Promise<DeployResult>;
    /** Run a Foundry script (broadcast). */
    runScript(script: string, network: string): Promise<DeployResult>;
    /** Get the registry (for querying deployed addresses). */
    getRegistry(): GhostDeploymentRegistry;
}
//# sourceMappingURL=GhostDeploymentEngine.d.ts.map
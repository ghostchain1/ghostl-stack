export interface UpgradeResult {
    proxy: string;
    implementation: string;
    network: string;
    txHash?: string;
    success: boolean;
    error?: string;
}
/**
 * GhostUpgradeManager — handles transparent / UUPS proxy upgrades via a
 * Foundry upgrade script plus calls to `cast send` for last-mile execution.
 */
export declare class GhostUpgradeManager {
    private readonly rpcUrl;
    private readonly privateKey;
    constructor(rpcUrl: string, privateKey?: string);
    /**
     * Upgrade `proxy` to point to `implementation` on `network`.
     *
     * Calls `upgradeTo(address)` (transparent / UUPS ABI) directly via cast.
     */
    upgrade(proxy: string, implementation: string, network: string): Promise<UpgradeResult>;
    /** Upgrade via a Foundry upgrade script instead of direct cast call. */
    upgradeViaScript(scriptPath: string, proxy: string, implementation: string, network: string): Promise<UpgradeResult>;
}
//# sourceMappingURL=GhostUpgradeManager.d.ts.map
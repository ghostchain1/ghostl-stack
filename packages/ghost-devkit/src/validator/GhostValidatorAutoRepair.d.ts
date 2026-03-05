export interface RepairResult {
    action: "none" | "restart" | "ensurePeers" | "failed";
    detail?: string;
}
export declare class GhostValidatorAutoRepair {
    private readonly health;
    repair(rpcUrl: string, minPeers: number): Promise<RepairResult>;
    private dockerRestartValidator;
    private addBootnodesViaAdmin;
}
//# sourceMappingURL=GhostValidatorAutoRepair.d.ts.map
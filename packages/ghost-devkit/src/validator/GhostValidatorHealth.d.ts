export interface HealthResult {
    block?: bigint;
    peers?: number;
    syncing?: boolean;
    healthy: boolean;
}
export declare class GhostValidatorHealth {
    check(rpcUrl: string): Promise<HealthResult>;
    private rpc;
}
//# sourceMappingURL=GhostValidatorHealth.d.ts.map
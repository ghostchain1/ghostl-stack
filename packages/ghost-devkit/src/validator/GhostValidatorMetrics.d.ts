export interface ValidatorMetrics {
    blockNumber: bigint;
    peerCount: number;
    syncing: boolean;
    gasPrice?: bigint;
    pendingTxCount?: number;
    /** Unix ms when collected */
    collectedAt: number;
}
export declare class GhostValidatorMetrics {
    collect(rpcUrl: string): Promise<ValidatorMetrics>;
    private rpc;
}
//# sourceMappingURL=GhostValidatorMetrics.d.ts.map
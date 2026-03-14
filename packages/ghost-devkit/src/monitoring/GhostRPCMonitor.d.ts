export interface RPCHealth {
    url: string;
    online: boolean;
    latencyMs?: number;
    blockNumber?: bigint;
    chainId?: bigint;
    error?: string;
}
export declare class GhostRPCMonitor {
    check(url: string): Promise<RPCHealth>;
    checkAll(urls: string[]): Promise<RPCHealth[]>;
    private call;
}
//# sourceMappingURL=GhostRPCMonitor.d.ts.map
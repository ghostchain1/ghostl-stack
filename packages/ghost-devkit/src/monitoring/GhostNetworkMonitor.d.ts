export interface LayerStatus {
    rpcUrl: string;
    blockNumber?: bigint;
    peerCount?: number;
    syncing?: boolean;
    latencyMs?: number;
    online: boolean;
}
export interface NetworkStatus {
    l1: LayerStatus;
    l2: LayerStatus;
    l3: LayerStatus;
    timestamp: string;
}
export declare class GhostNetworkMonitor {
    status(): Promise<NetworkStatus>;
    private probeLayer;
    private rpcCall;
}
//# sourceMappingURL=GhostNetworkMonitor.d.ts.map
import type { ChildProcess } from "node:child_process";
export interface AnvilOptions {
    port?: number;
    chainId?: number;
    blockTime?: number;
    accounts?: number;
    balance?: number;
    forkUrl?: string;
    forkBlock?: number;
    silent?: boolean;
}
export declare class GhostAnvilRunner {
    private proc;
    private readonly opts;
    constructor(opts?: AnvilOptions);
    static forLayer(layer: "l1" | "l2" | "l3", overrides?: AnvilOptions): GhostAnvilRunner;
    start(): ChildProcess;
    stop(): void;
    get pid(): number | undefined;
    /** Wait until the RPC is answering (polls eth_blockNumber) */
    waitReady(timeoutMs?: number): Promise<void>;
    /** Convenience: snapshot (evm_snapshot) */
    snapshot(): Promise<string>;
    /** Revert to a snapshot */
    revert(snapshotId: string): Promise<void>;
}
//# sourceMappingURL=GhostAnvilRunner.d.ts.map
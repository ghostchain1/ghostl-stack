export interface CastCallResult {
    raw: string;
    decoded?: string;
}
export interface CastSendResult {
    txHash: string;
    blockNumber?: string;
}
export declare class GhostCastAdapter {
    private readonly rpcUrl;
    constructor(rpcUrl: string);
    static create(): Promise<GhostCastAdapter>;
    /** eth_call a view function */
    call(address: string, sig: string, args?: string[]): Promise<CastCallResult>;
    /** Broadcast a transaction */
    send(address: string, sig: string, args?: string[], opts?: {
        privateKey?: string;
        value?: string;
    }): Promise<CastSendResult>;
    /** Estimate gas */
    estimate(address: string, sig: string, args?: string[]): Promise<bigint>;
    /** Decode calldata */
    decode(sig: string, data: string): Promise<string>;
    /** Get current block number */
    blockNumber(): Promise<bigint>;
    /** Get ETH balance */
    balance(address: string): Promise<string>;
    /** Keccak-256 of a string */
    keccak(input: string): Promise<string>;
    /** ABI-encode arguments */
    abi(sig: string, args?: string[]): Promise<string>;
    /** Convert units (e.g., "1 ether" to wei) */
    toWei(value: string, unit?: string): Promise<bigint>;
}
//# sourceMappingURL=GhostCastAdapter.d.ts.map
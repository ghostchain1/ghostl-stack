/** EIP-2930 access list entry */
export interface AccessListEntry {
    address: string;
    storageKeys: string[];
}
export type AccessList = AccessListEntry[];
export declare class GhostTransaction {
    chainId: number;
    nonce: number;
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
    gasLimit: bigint;
    to?: string;
    value: bigint;
    data: string;
    accessList: AccessList;
    gasPrice?: bigint;
    from?: string;
    /**
     * Returns keccak256(0x02 || rlp(unsignedFields)).
     * This 32-byte digest is what gets signed.
     */
    signingHash(): Uint8Array;
    /** Returns 0x02 || rlp(unsignedFields) as bytes. */
    serialize(): Uint8Array;
    /**
     * Returns the fully signed raw transaction hex string.
     * @param v   recovery bit: 0 or 1 (EIP-1559 — NOT 27/28)
     * @param r   32-byte r component
     * @param s   32-byte s component
     */
    encodeSigned(v: number, r: Uint8Array, s: Uint8Array): string;
    private _unsignedRlpFields;
}
export declare function makeL1Transaction(fields: Partial<GhostTransaction>): GhostTransaction;
export declare function makeL2Transaction(fields: Partial<GhostTransaction>): GhostTransaction;
export declare function makeL3Transaction(fields: Partial<GhostTransaction>): GhostTransaction;

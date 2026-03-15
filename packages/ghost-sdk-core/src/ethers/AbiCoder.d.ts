import type { BytesLike } from "./types";
export declare class AbiCoder {
    private _coder;
    /** Singleton, matching ethers.AbiCoder.defaultAbiCoder() pattern. */
    static defaultAbiCoder(): AbiCoder;
    /**
     * Encode values according to the given ABI types.
     * @param types  e.g. ["uint256", "address", "bool"]
     * @param values matching values
     */
    encode(types: readonly string[], values: unknown[]): string;
    /**
     * Decode ABI-encoded data into an array of JS values.
     * Returns an array-like object with positional and named access.
     */
    decode(types: string[], data: BytesLike): ReadonlyArray<unknown>;
    private _decodeWord;
}

import type { GhostABIFragment } from "../types";
export declare class GhostAbiCoder {
    /**
     * Compute the 4-byte function selector for `name(type,type,...)`.
     */
    encodeFunctionSelector(fragment: GhostABIFragment): string;
    /**
     * Encode a function call: selector + ABI-encoded params.
     * NOTE: This is a simplified encoder that handles primitive uint/address/bytes32/bool/string.
     * For full tuple / dynamic array support, extend pad32() below.
     */
    encodeFunctionCall(fragment: GhostABIFragment, params: unknown[]): string;
    /**
     * Decode the result bytes from an eth_call into a usable value.
     * Returns the first output for single-value results.
     */
    decodeFunctionResult(fragment: GhostABIFragment, hex: string): unknown;
    /**
     * Compute the event topic0 (keccak256 of the event signature).
     */
    encodeEventTopic(fragment: GhostABIFragment): string;
    private encode;
    private decode;
}

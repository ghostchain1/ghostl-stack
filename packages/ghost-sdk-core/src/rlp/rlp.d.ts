export type RlpInput = bigint | number | Uint8Array | string | RlpInput[];
export declare function rlpEncode(input: RlpInput): Uint8Array;
export declare function rlpDecode(data: Uint8Array, offset?: number): {
    value: RlpInput;
    consumed: number;
};

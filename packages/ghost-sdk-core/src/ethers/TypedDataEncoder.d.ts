import type { GhostTypedDataDomain, GhostTypedDataTypes, GhostTypedDataField } from "../types";
export { GhostTypedDataDomain as TypedDataDomain };
export { GhostTypedDataTypes as TypedDataTypes };
export { GhostTypedDataField as TypedDataField };
export declare class TypedDataEncoder {
    private _types;
    private _primaryType;
    constructor(types: GhostTypedDataTypes);
    /** Compute the full EIP-712 digest: keccak256(\x19\x01 || domainSep || structHash) */
    static hash(domain: GhostTypedDataDomain, types: GhostTypedDataTypes, value: Record<string, any>): string;
    /** Compute just the domain separator hash — returns 0x-prefixed hex string (ethers v6-compatible). */
    static hashDomainHex(domain: GhostTypedDataDomain): string;
    /** 3-argument static hashStruct (ethers v6 API). Returns 0x-prefixed hex string. */
    static hashStructHex(primaryType: string, types: GhostTypedDataTypes, value: Record<string, any>): string;
    /** Compute just the domain separator hash. */
    static hashDomain(domain: GhostTypedDataDomain): Uint8Array;
    /** Compute the struct hash for a given type name and value. */
    hashStruct(primaryType: string, value: Record<string, any>): Uint8Array;
    /** Returns the EIP-712 type string for the primary type, e.g. "Mail(string from,string to)" */
    encodeType(primaryType?: string): string;
    /** The keccak256 of the full type string. */
    typeHash(primaryType?: string): string;
}

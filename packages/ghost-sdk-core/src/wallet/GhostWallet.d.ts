import { GhostTransaction } from "../tx/GhostTransaction";
export declare class GhostWallet {
    private readonly _privateKey;
    constructor(privateKey: string);
    /**
     * Real GhostChain address:
     *   secp256k1.getPublicKey(privKey, false)  →  65 bytes (0x04 + 64 raw)
     *   drop prefix byte                         →  64 bytes
     *   keccak256(64 bytes)                      →  32 bytes
     *   last 20 bytes                            →  address
     *   EIP-55 checksum                          →  final address
     */
    get address(): string;
    /** 65-byte uncompressed public key as 0x hex. */
    get publicKey(): string;
    /** 33-byte compressed public key as 0x hex. */
    get publicKeyCompressed(): string;
    /**
     * Signs an EIP-1559 (type 2) transaction.
     * Returns the 0x-prefixed raw transaction hex ready for eth_sendRawTransaction.
     */
    signTransaction(tx: GhostTransaction): Promise<string>;
    /**
     * Signs a plain message per EIP-191.
     * Returns 65-byte hex: r(32) || s(32) || v(1) where v ∈ {27, 28}.
     */
    signMessage(message: string | Uint8Array): Promise<string>;
    /** Recover the signer address from a 65-byte EIP-191 signature + original message. */
    static recoverSigner(message: string | Uint8Array, signatureHex: string): string;
    static generateRandom(): GhostWallet;
    /** Export private key as 0x hex – keep secret! */
    exportPrivateKey(): string;
}

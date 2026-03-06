/**
 * GhostSigner — abstract signer interface.
 *
 * Implement this to create custom signers (hardware wallet, remote signer, etc.)
 * that plug into GhostWalletClient and GhostNativeContract.
 */

import type { GhostAddress, Hex, GhostTxRequest } from "../native/types.js";

export interface GhostSigner {
  /** The address derived from this signer's key material. */
  readonly address: GhostAddress;

  /**
   * Sign an arbitrary 32-byte hash (Keccak256 of some data).
   * Returns a 65-byte compact signature as hex.
   */
  signHash(hash: Hex): Promise<Hex>;

  /**
   * Sign an EIP-191 personal message (adds "\x19GhostChain Signed Message:\n" prefix).
   */
  signMessage(message: string | Uint8Array): Promise<Hex>;

  /**
   * Sign a typed data payload (EIP-712).
   */
  signTypedData(domain: Eip712Domain, types: Record<string, Eip712Type[]>, value: Record<string, unknown>): Promise<Hex>;

  /**
   * Sign and serialize an EIP-1559 (type 2) transaction ready for broadcast.
   * Returns the RLP-encoded signed transaction as hex.
   */
  signTransaction(tx: GhostTxRequest): Promise<Hex>;
}

export type Eip712Domain = {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: GhostAddress;
  salt?: Hex;
};

export type Eip712Type = {
  name: string;
  type: string;
};

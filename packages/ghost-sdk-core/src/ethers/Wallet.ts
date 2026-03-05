// ─────────────────────────────────────────────────────────────────────────────
// Wallet – ethers v6-compatible Wallet class
// Wraps GhostWallet + GhostSigner and exposes the ethers API surface.
// Works across GhostChain L1, L2, and L3.
// ─────────────────────────────────────────────────────────────────────────────

import { GhostWallet }    from "../wallet/GhostWallet";
import { GhostSigner }    from "../tx/GhostSigner";
import { GhostNonceManager } from "../nonce/GhostNonceManager";
import { JsonRpcProvider } from "./Provider";
import { TypedDataEncoder } from "./TypedDataEncoder";
import { GhostChains }    from "../chains/ghostChains";
import { GhostTransaction, makeL1Transaction, makeL2Transaction, makeL3Transaction } from "../tx/GhostTransaction";
import type {
  TransactionRequest,
  TransactionReceipt,
  ContractTransactionResponse,
  BigNumberish
} from "./types";
import type { GhostTypedDataDomain, GhostTypedDataTypes } from "../types";
import { toBigInt } from "./types";

type LayerKey = "L1" | "L2" | "L3";
const LAYER_FACTORIES: Record<LayerKey, (f: Partial<GhostTransaction>) => GhostTransaction> = {
  L1: makeL1Transaction,
  L2: makeL2Transaction,
  L3: makeL3Transaction
};

export class Wallet {
  private readonly _ghost: GhostWallet;
  private _provider: JsonRpcProvider | null = null;
  private _nonces: GhostNonceManager | null = null;

  constructor(privateKey: string, provider?: JsonRpcProvider) {
    this._ghost = new GhostWallet(privateKey);
    if (provider) this._setProvider(provider);
  }

  // ─── Static factories ────────────────────────────────────────────────────

  static createRandom(provider?: JsonRpcProvider): Wallet {
    const w = GhostWallet.generateRandom();
    return new Wallet(w.exportPrivateKey(), provider);
  }

  /** Create from mnemonic is not natively supported; throws with clear message. */
  static fromPhrase(_mnemonic: string): never {
    throw new Error(
      "Wallet.fromPhrase: BIP-39 mnemonic import is not built into ghost-sdk-core. " +
      "Generate a raw private key instead, or use an HD wallet library."
    );
  }

  /** Convenience: wallet connected to GhostChain L1 / L2 / L3. */
  static forLayer(privateKey: string, layer: LayerKey, rpcOverride?: string): Wallet {
    const provider = JsonRpcProvider.forLayer(layer, rpcOverride);
    return new Wallet(privateKey, provider);
  }

  static forL1(privateKey: string, rpcOverride?: string): Wallet {
    return Wallet.forLayer(privateKey, "L1", rpcOverride);
  }

  static forL2(privateKey: string, rpcOverride?: string): Wallet {
    return Wallet.forLayer(privateKey, "L2", rpcOverride);
  }

  static forL3(privateKey: string, rpcOverride?: string): Wallet {
    return Wallet.forLayer(privateKey, "L3", rpcOverride);
  }

  // ─── Provider management ─────────────────────────────────────────────────

  connect(provider: JsonRpcProvider): Wallet {
    const w = new Wallet(this._ghost.exportPrivateKey(), provider);
    return w;
  }

  get provider(): JsonRpcProvider | null {
    return this._provider;
  }

  // ─── Identity ────────────────────────────────────────────────────────────

  get address(): string {
    return this._ghost.address;
  }

  get publicKey(): string {
    return this._ghost.publicKey;
  }

  get privateKey(): string {
    return this._ghost.exportPrivateKey();
  }

  // ─── Balances / nonce ────────────────────────────────────────────────────

  async getBalance(tag = "latest"): Promise<bigint> {
    return this._requireProvider().getBalance(this.address, tag);
  }

  async getTransactionCount(tag = "latest"): Promise<number> {
    return this._requireProvider().getTransactionCount(this.address, tag);
  }

  // ─── Signing (no broadcast) ──────────────────────────────────────────────

  /** Sign a raw message (EIP-191). Returns 65-byte hex. */
  async signMessage(message: string | Uint8Array): Promise<string> {
    return this._ghost.signMessage(message);
  }

  /** Sign an EIP-712 typed data payload. */
  async signTypedData(
    domain: GhostTypedDataDomain,
    types:  GhostTypedDataTypes,
    value:  Record<string, unknown>
  ): Promise<string> {
    const digest = TypedDataEncoder.hash(domain, types, value);
    // digest is already the 0x-prefixed hash string; sign it as a raw Uint8Array
    const digestBytes = Uint8Array.from(Buffer.from(digest.slice(2), "hex"));
    return this._ghost.signMessage(digestBytes);
  }

  /** Sign a TransactionRequest without broadcasting. Returns raw signed hex. */
  async signTransaction(tx: TransactionRequest): Promise<string> {
    const layer = await this._detectLayer();
    const factory = LAYER_FACTORIES[layer];

    const nonce =
      tx.nonce !== undefined
        ? Number(toBigInt(tx.nonce))
        : await this._nextNonce();

    const feeData = await this._requireProvider().getFeeData();

    const ghostTx = factory({
      to:                    tx.to,
      from:                  this.address,
      value:                 tx.value !== undefined ? toBigInt(tx.value) : 0n,
      data:                  typeof tx.data === "string" ? tx.data : "0x",
      nonce,
      gasLimit:              tx.gasLimit  !== undefined ? toBigInt(tx.gasLimit)  : 21_000n,
      maxFeePerGas:          tx.maxFeePerGas          !== undefined ? toBigInt(tx.maxFeePerGas)          : feeData.maxFeePerGas         ?? 2_000_000_000n,
      maxPriorityFeePerGas:  tx.maxPriorityFeePerGas  !== undefined ? toBigInt(tx.maxPriorityFeePerGas)  : feeData.maxPriorityFeePerGas ?? 1_000_000_000n,
      accessList:            (tx.accessList as GhostTransaction["accessList"]) ?? []
    });

    return this._ghost.signTransaction(ghostTx);
  }

  // ─── Send ────────────────────────────────────────────────────────────────

  /** Sign and broadcast a transaction. Returns ContractTransactionResponse. */
  async sendTransaction(tx: TransactionRequest): Promise<ContractTransactionResponse> {
    const provider = this._requireProvider();
    const raw      = await this.signTransaction(tx);
    const hash     = await provider.sendRawTransaction(raw);
    return this._buildResponse(hash, tx);
  }

  /** ETH transfer shorthand. */
  async sendEther(to: string, value: BigNumberish): Promise<ContractTransactionResponse> {
    return this.sendTransaction({ to, value });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private _requireProvider(): JsonRpcProvider {
    if (!this._provider) throw new Error("Wallet: no provider connected. Use wallet.connect(provider).");
    return this._provider;
  }

  private _setProvider(provider: JsonRpcProvider): void {
    this._provider = provider;
    this._nonces   = new GhostNonceManager(provider.ghost);
  }

  private async _detectLayer(): Promise<LayerKey> {
    const net = await this._requireProvider().getNetwork();
    const chainId = Number(net.chainId);
    for (const [key, cfg] of Object.entries(GhostChains)) {
      if (cfg.chainId === chainId) return key as LayerKey;
    }
    return "L1"; // default
  }

  private async _nextNonce(): Promise<number> {
    if (this._nonces) return this._nonces.next(this.address);
    return this._requireProvider().getTransactionCount(this.address);
  }

  private _buildResponse(hash: string, tx: TransactionRequest): ContractTransactionResponse {
    const provider = this._requireProvider();
    return {
      hash,
      blockNumber:          null,
      blockHash:            null,
      from:                 this.address,
      to:                   tx.to ?? null,
      nonce:                0,
      gasLimit:             tx.gasLimit !== undefined ? toBigInt(tx.gasLimit) : 21_000n,
      gasPrice:             tx.gasPrice !== undefined ? toBigInt(tx.gasPrice) : null,
      maxFeePerGas:         tx.maxFeePerGas !== undefined ? toBigInt(tx.maxFeePerGas) : null,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas !== undefined ? toBigInt(tx.maxPriorityFeePerGas) : null,
      value:                tx.value !== undefined ? toBigInt(tx.value) : 0n,
      data:                 typeof tx.data === "string" ? tx.data : "0x",
      chainId:              0n,
      type:                 2,
      wait: async (confirms = 1): Promise<TransactionReceipt> =>
        provider.waitForTransaction(hash, confirms),
      toJSON: () => ({ hash, to: tx.to, from: this.address })
    };
  }
}

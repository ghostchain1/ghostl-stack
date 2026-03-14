/**
 * GhostWalletClient — signing & broadcasting client for GhostChain.
 *
 * Combines a public client with a signer, viem-style.
 *
 * Usage:
 *   const client = new GhostWalletClient({
 *     rpcUrl: "http://localhost:18545",
 *     account: GhostAccount.fromPrivateKey("0x..."),
 *   })
 *   const hash = await client.sendTransaction({ to: "0x...", value: 1n })
 *   const sig  = await client.signMessage({ message: "hello" })
 */

import { GhostPublicClient, type GhostPublicClientConfig } from "./GhostPublicClient.js";
import type { GhostSigner } from "../wallet/GhostSigner.js";
import type { GhostAddress, Hex, GhostTxRequest } from "../native/types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

export type GhostWalletClientConfig = GhostPublicClientConfig & {
  account: GhostSigner;
};

export class GhostWalletClient extends GhostPublicClient {
  public readonly account: GhostSigner;

  constructor(config: GhostWalletClientConfig) {
    super(config);
    this.account = config.account;
  }

  get address(): GhostAddress {
    return this.account.address;
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  async signMessage({ message }: { message: string | Uint8Array }): Promise<Hex> {
    return this.account.signMessage(message);
  }

  async signTypedData({ domain, types, value }: {
    domain: Parameters<GhostSigner["signTypedData"]>[0];
    types: Parameters<GhostSigner["signTypedData"]>[1];
    value: Parameters<GhostSigner["signTypedData"]>[2];
  }): Promise<Hex> {
    return this.account.signTypedData(domain, types, value);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async sendTransaction(params: {
    to?: GhostAddress;
    value?: bigint;
    data?: Hex;
    nonce?: number;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }): Promise<Hex> {
    const chainId = await this.getChainId();
    const from = this.account.address;

    const nonce = params.nonce ?? await this.provider.getTransactionCount(from);
    const { maxFeePerGas, maxPriorityFeePerGas } = await this._getFees(params);

    let gasLimit = params.gasLimit;
    if (!gasLimit) {
      gasLimit = await this.provider.estimateGas({
        from,
        to: params.to,
        data: params.data,
        value: params.value,
      });
      // add 20% buffer
      gasLimit = (gasLimit * 12n) / 10n;
    }

    const tx: GhostTxRequest = {
      from,
      to: params.to,
      value: params.value,
      data: params.data,
      nonce,
      gasLimit,
      chainId,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    const signed = await this.account.signTransaction(tx);
    return this.provider.sendRawTransaction(signed);
  }

  async sendRawTransaction({ serializedTx }: { serializedTx: Hex }): Promise<Hex> {
    return this.provider.sendRawTransaction(serializedTx);
  }

  // ── Deploy ────────────────────────────────────────────────────────────────

  async deployContract({ bytecode, abi, args, value }: {
    bytecode: Hex;
    abi: unknown[];
    args?: unknown[];
    value?: bigint;
  }): Promise<{ hash: Hex; address?: GhostAddress }> {
    const { GhostContractFactory } = await import("../contracts/GhostContractFactory.js");
    const { GhostNativeWallet } = await import("../native/GhostNativeWallet.js");

    // GhostContractFactory needs a GhostNativeWallet — check if account is one
    const nat = (this.account as unknown as { wallet?: import("../native/GhostNativeWallet.js").GhostNativeWallet }).wallet;
    if (!nat) throw new GhostValidationError("deployContract requires a native wallet account");

    const factory = new GhostContractFactory(
      abi as import("../contracts/GhostContractFactory.js").AbiFragment[],
      bytecode,
      this.provider,
      nat
    );
    const result = await factory.deploy(args ?? [], { value });
    return { hash: result.transactionHash, address: result.address };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _getFees(overrides: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }) {
    if (overrides.maxFeePerGas && overrides.maxPriorityFeePerGas) {
      return { maxFeePerGas: overrides.maxFeePerGas, maxPriorityFeePerGas: overrides.maxPriorityFeePerGas };
    }
    const history = await this.provider.getFeeHistory(5, "latest", [50]).catch(() => null);
    const baseFees = history?.baseFeePerGas ?? [];
    const lastBase = baseFees.length
      ? BigInt(parseInt((baseFees[baseFees.length - 1] ?? "0xa"), 16))
      : 10_000_000_000n;
    const priority = overrides.maxPriorityFeePerGas ?? 2_000_000_000n;
    const maxFeePerGas = overrides.maxFeePerGas ?? (lastBase * 2n + priority);
    return { maxFeePerGas, maxPriorityFeePerGas: priority };
  }
}

/**
 * GhostContractFactory — deploy smart contracts from ABI + bytecode.
 *
 * Usage:
 *   const factory = new GhostContractFactory(abi, bytecode, provider, wallet)
 *   const { address, receipt } = await factory.deploy([constructorArg1, ...])
 */

import { GhostNativeWallet } from "../native/GhostNativeWallet.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import { encodeCall, functionSelector } from "../native/abi.js";
import { add0x, strip0x, hexToBigInt } from "../native/hex.js";
import type { GhostAddress, Hex, GhostTxReceipt } from "../native/types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

export type AbiFragment = {
  type: "function" | "constructor" | "event" | "error" | "fallback" | "receive";
  name?: string;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  stateMutability?: string;
};

export type DeployResult = {
  transactionHash: Hex;
  address: GhostAddress;
  receipt: GhostTxReceipt;
};

export class GhostContractFactory {
  constructor(
    private readonly abi: AbiFragment[],
    private readonly bytecode: Hex,
    private readonly provider: HttpProvider,
    private readonly wallet: GhostNativeWallet
  ) {}

  /**
   * Deploy the contract, optionally passing constructor arguments.
   * Waits for the transaction receipt.
   */
  async deploy(args: unknown[] = [], overrides: { value?: bigint; gasLimit?: bigint } = {}): Promise<DeployResult> {
    const constructorAbi = this.abi.find(f => f.type === "constructor");
    let data: Hex;

    if (constructorAbi?.inputs?.length) {
      const types = constructorAbi.inputs.map(i => i.type as "uint256" | "address" | "bool" | "bytes32" | "bytes" | "string");
      // Encode constructor args (no selector prefix)
      const encoded = encodeCall("constructor()", types, args);
      // Strip the 4-byte selector and concatenate with bytecode
      const argsHex = strip0x(encoded).slice(8);
      data = add0x(strip0x(this.bytecode) + argsHex) as Hex;
    } else {
      data = this.bytecode;
    }

    const gasLimit = overrides.gasLimit ?? await this.provider.estimateGas({
      from: this.wallet.address,
      data,
    });

    const txHash = await this.wallet.sendTransaction(this.provider as unknown as import("../native/GhostNativeProvider.js").GhostNativeProvider, {
      to: undefined,
      data,
      value: overrides.value,
      gasLimit,
    });

    const receipt = await this._waitForReceipt(txHash);
    const address = receipt.contractAddress;
    if (!address) throw new GhostValidationError("Deployment failed — no contractAddress in receipt");

    return { transactionHash: txHash, address, receipt };
  }

  private async _waitForReceipt(txHash: Hex, maxAttempts = 60, pollMs = 2000): Promise<GhostTxReceipt> {
    for (let i = 0; i < maxAttempts; i++) {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new GhostValidationError(`Transaction ${txHash} not mined after ${maxAttempts * pollMs / 1000}s`);
  }
}

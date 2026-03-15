/**
 * GhostDeployEngine — replaces ethers-based deployment scripts.
 * Deploys contracts using GhostSDK natively.
 */
import { GhostProvider, GhostWallet, GhostGasEngine } from "@ghoststack/ghost-sdk";

export interface DeployOptions {
  provider:   GhostProvider;
  wallet:     GhostWallet;
  bytecode:   string;
  abi:        unknown[];
  args?:      unknown[];
  gasLimit?:  string;
}

export interface DeployResult {
  address:   string;
  txHash:    string;
  blockNumber?: number;
}

export class GhostDeployEngine {
  static async deploy(opts: DeployOptions): Promise<DeployResult> {
    const { provider, wallet, bytecode, abi: _abi, args = [], gasLimit } = opts;

    const constructorArgs = args.length > 0
      ? Buffer.from(JSON.stringify(args)).toString("hex")
      : "";

    const tx = {
      from:     await wallet.getAddress(),
      data:     `${bytecode}${constructorArgs}`,
      gasLimit: gasLimit ?? await GhostGasEngine.estimate(provider, { data: bytecode }),
      gasPrice: await GhostGasEngine.getGasPrice(provider),
      value:    "0x0",
      nonce:    0,
    } as any;

    const txHash = await wallet.sendTransaction(tx);

    const receipt = await provider.getReceipt(txHash) as { contractAddress: string; blockNumber: number } | null;

    return {
      address:     receipt?.contractAddress ?? "0x",
      txHash,
      blockNumber: receipt?.blockNumber,
    };
  }
}

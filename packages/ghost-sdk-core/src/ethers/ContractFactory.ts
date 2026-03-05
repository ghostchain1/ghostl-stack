// ─────────────────────────────────────────────────────────────────────────────
// ContractFactory – ethers v6-compatible factory
// Deploy contracts using bytecode + ABI on any GhostChain layer.
// ─────────────────────────────────────────────────────────────────────────────

import { Interface }      from "./Interface";
import { Contract }       from "./Contract";
import { JsonRpcProvider } from "./Provider";
import type { GhostABIFragment } from "../types";
import type { BigNumberish, ContractTransactionResponse, TransactionReceipt } from "./types";
import { toBigInt } from "./types";

/** A deployed contract handle returned from ContractFactory.deploy() */
export interface DeployedContract {
  target:              string;
  contract:            Contract;
  deploymentReceipt:   TransactionReceipt;
  deployTransaction:   ContractTransactionResponse;
}

export class ContractFactory {
  readonly interface:  Interface;
  readonly bytecode:   string;
  private  _runner:    any; // Wallet (GhostSigner) with .send() + .provider

  constructor(
    abi:      GhostABIFragment[] | string,
    bytecode: string,
    runner:   any
  ) {
    this.interface = new Interface(abi);
    this.bytecode  = bytecode.startsWith("0x") ? bytecode : "0x" + bytecode;
    this._runner   = runner;
  }

  /** Connect to a different runner (signer). */
  connect(runner: any): ContractFactory {
    return new ContractFactory(this.interface["_abi"], this.bytecode, runner);
  }

  // ─── Deployment ──────────────────────────────────────────────────────────

  /**
   * Encode the deployment transaction data (bytecode + constructor args).
   * Call this if you need the raw data without broadcasting.
   */
  getDeployTransaction(...args: unknown[]): { data: string; value?: bigint } {
    const constructorArgs = this.interface.encodeDeploy(args);
    const data = this.bytecode + constructorArgs.slice(2); // strip "0x" from args
    return { data };
  }

  /**
   * Deploy the contract on-chain.
   * @param args Constructor arguments. Last arg may be `{ value: bigint }` overrides.
   */
  async deploy(...args: unknown[]): Promise<DeployedContract> {
    // Extract overrides if present as last argument
    let deployArgs = args;
    let value: bigint = 0n;
    const last = args[args.length - 1];
    if (
      last &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      "value" in (last as object)
    ) {
      value = toBigInt((last as { value: BigNumberish }).value);
      deployArgs = args.slice(0, -1);
    }

    const { data } = this.getDeployTransaction(...deployArgs);

    // Broadcast via the signer's send()
    const hash: string = await this._runner.send({ data, value, to: undefined });

    const provider: JsonRpcProvider = this._runner.provider;

    const receipt = await provider.waitForTransaction(hash, 1);

    if (!receipt.contractAddress) {
      throw new Error(`Deployment failed – no contractAddress in receipt (tx: ${hash})`);
    }

    const contract = new Contract(
      receipt.contractAddress,
      this.interface["_abi"],
      this._runner
    );

    const deployTransaction: ContractTransactionResponse = {
      hash,
      blockNumber:          null,
      blockHash:            null,
      from:                 this._runner.address ?? "0x",
      to:                   null,
      nonce:                0,
      gasLimit:             0n,
      gasPrice:             null,
      maxFeePerGas:         null,
      maxPriorityFeePerGas: null,
      value,
      data,
      chainId:              0n,
      type:                 2,
      wait: async () => receipt,
      toJSON: () => ({ hash, contractAddress: receipt.contractAddress })
    };

    return { target: receipt.contractAddress, contract, deploymentReceipt: receipt, deployTransaction };
  }
}

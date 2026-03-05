// ─────────────────────────────────────────────────────────────────────────────
// BaseContract – ethers v6-compatible base class
// Attach a contract address + ABI to a Provider or Signer.
// ─────────────────────────────────────────────────────────────────────────────

import { Interface }      from "./Interface";
import { JsonRpcProvider } from "./Provider";
import type { TransactionReceipt, ContractTransactionResponse, BigNumberish } from "./types";
import type { GhostABIFragment, GhostLog }  from "../types";

export type ContractRunner = JsonRpcProvider | { provider: JsonRpcProvider; address: string };

function _getProvider(runner: ContractRunner): JsonRpcProvider {
  if (runner instanceof JsonRpcProvider) return runner;
  return (runner as any).provider as JsonRpcProvider;
}

export class BaseContract {
  readonly target:    string;
  readonly interface: Interface;
  protected _runner:  ContractRunner;

  constructor(
    address: string,
    abi:     GhostABIFragment[] | string,
    runner:  ContractRunner
  ) {
    this.target    = address;
    this.interface = new Interface(abi);
    this._runner   = runner;
  }

  get provider(): JsonRpcProvider {
    return _getProvider(this._runner);
  }

  /** Connect this contract to a different runner (provider or signer). */
  connect(runner: ContractRunner): this {
    const C = this.constructor as new (
      address: string,
      abi: GhostABIFragment[],
      runner: ContractRunner
    ) => this;
    return new C(this.target, this.interface["_abi"], runner);
  }

  /** Low-level eth_call. Returns raw hex result. */
  async _call(method: string, args: unknown[]): Promise<string> {
    const data = this.interface.encodeFunctionData(method, args);
    return this.provider.call({ to: this.target, data });
  }

  /** Low-level eth_sendRawTransaction (requires signer runner). */
  async _send(method: string, args: unknown[], value?: BigNumberish): Promise<ContractTransactionResponse> {
    const data = this.interface.encodeFunctionData(method, args);
    const signer = this._runner as any;
    if (!signer.signTransaction && !signer.send) {
      throw new Error("BaseContract._send requires a Wallet (signer), not a bare Provider");
    }
    // GhostSigner path
    const hash: string = await signer.send({
      to:    this.target,
      data,
      value: value !== undefined ? BigInt(value) : 0n
    });
    return this._buildResponse(hash);
  }

  /** Query event logs and decode them with the ABI. */
  async queryFilter(
    event: string,
    fromBlock: number | string = 0,
    toBlock: number | string = "latest"
  ) {
    const fragment = this.interface.getEvent(event);
    const logs = await this.provider.getLogs({
      address:   this.target,
      fromBlock,
      toBlock,
      topics:    [fragment.topic]
    });
    return logs.map((log) => ({
      ...log,
      args: this.interface.parseLog(log as unknown as GhostLog)?.args ?? {}
    }));
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  protected _buildResponse(hash: string): ContractTransactionResponse {
    const provider = this.provider;
    return {
      hash,
      blockNumber:           null,
      blockHash:             null,
      from:                  (this._runner as any).address ?? "0x",
      to:                    this.target,
      nonce:                 0,
      gasLimit:              21_000n,
      gasPrice:              null,
      maxFeePerGas:          null,
      maxPriorityFeePerGas:  null,
      value:                 0n,
      data:                  "0x",
      chainId:               0n,
      type:                  2,
      wait: async (confirms = 1): Promise<TransactionReceipt> =>
        provider.waitForTransaction(hash, confirms),
      toJSON: () => ({ hash, to: this.target })
    };
  }
}

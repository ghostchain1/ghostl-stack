/**
 * @file GhostContract.ts
 * @description GhostChain smart contract interaction wrapper.
 * Replaces ethers.Contract in GhostStack consumer code.
 *
 * @example
 *   const token = new GhostContract(GST_ADDRESS, ERC20_ABI, wallet);
 *   const balance = await token.call("balanceOf", [address]);
 */

import type { GhostProvider } from "./GhostProvider.js";
import type { GhostWallet } from "./GhostWallet.js";
import { GhostAbiEncoder, type AbiParamType } from "./contract/GhostAbiEncoder.js";

type AbiFragment = Record<string, unknown>;
type AbiInput = { name?: string; type: string };

const encoder = new GhostAbiEncoder();

/** Narrow ABI type strings to the supported encoding subset. Uint variants map to uint256. */
function toParamType(t: string): AbiParamType {
  if (t === "address") return "address";
  if (t === "bool") return "bool";
  if (t === "bytes") return "bytes";
  if (t === "bytes32") return "bytes32";
  if (t === "string") return "string";
  if (t.startsWith("uint")) return "uint256";
  throw new Error(`GhostContract: unsupported ABI type "${t}" — only address/bool/bytes/bytes32/string/uint* supported`);
}

export class GhostContract {
  readonly address: string;
  readonly abi: readonly AbiFragment[];
  readonly signerOrProvider: GhostWallet | GhostProvider;

  constructor(
    address: string,
    abi: readonly AbiFragment[],
    signerOrProvider: GhostWallet | GhostProvider
  ) {
    this.address = address;
    this.abi = abi;
    this.signerOrProvider = signerOrProvider;
  }

  private _findFragment(method: string): AbiFragment {
    const fragment = this.abi.find((f) => f["type"] === "function" && f["name"] === method);
    if (!fragment) throw new Error(`GhostContract: method "${method}" not found in ABI`);
    return fragment;
  }

  private _buildCalldata(method: string, fragment: AbiFragment, args: unknown[]): string {
    const inputs = (fragment["inputs"] as AbiInput[] | undefined) ?? [];
    const signature = `${method}(${inputs.map((i) => i.type).join(",")})`;
    const params = inputs.map((inp, idx) => ({
      type: toParamType(inp.type),
      value: args[idx],
    }));
    return encoder.encodeCall(signature, params);
  }

  async call(method: string, args: unknown[] = []): Promise<unknown> {
    const fragment = this._findFragment(method);
    const data = this._buildCalldata(method, fragment, args);
    const provider = this._provider();
    return provider.call({ to: this.address, data });
  }

  async send(method: string, args: unknown[] = [], value = 0n): Promise<string> {
    const fragment = this._findFragment(method);
    const data = this._buildCalldata(method, fragment, args);
    const wallet = this._wallet();
    return wallet.sendTransaction(this.address, data, value);
  }

  private _provider(): GhostProvider {
    const sop = this.signerOrProvider as GhostWallet | GhostProvider;
    // GhostWallet has a `provider` property; GhostProvider has `rpcUrl`
    if ("provider" in sop && sop.provider) return sop.provider as GhostProvider;
    if ("rpcUrl" in sop) return sop as GhostProvider;
    throw new Error("GhostContract: no provider available — pass a GhostProvider or a connected GhostWallet");
  }

  private _wallet(): GhostWallet {
    if (!("sendTransaction" in this.signerOrProvider)) {
      throw new Error("GhostContract.send: signerOrProvider must be a GhostWallet for state-changing calls");
    }
    return this.signerOrProvider as GhostWallet;
  }
}

import type { GhostAddress, GhostTxRequest, Hex } from "./types.js";
import { GhostNativeInterface } from "./GhostNativeInterface.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { normalizeAddress } from "./address.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";
import type { GhostNativeWallet } from "./GhostNativeWallet.js";

export type GhostNativeContractOptions = {
  provider: GhostNativeProvider;
  signer?: GhostNativeWallet;
};

/**
 * GhostNativeContract — ABI-encoded contract interactions without ethers.js.
 *
 * ```ts
 * const c = new GhostNativeContract("0xTOKEN", { provider, signer: wallet });
 * // Read
 * const raw = await c.call("balanceOf(address)", ["address"], [ownerAddr]);
 * const bal = c.iface.decodeUint256Result(raw);
 * // Write
 * const txHash = await c.send("transfer(address,uint256)", ["address","uint256"], [to, amount]);
 * ```
 */
export class GhostNativeContract {
  public readonly address: GhostAddress;
  public readonly iface: GhostNativeInterface;
  private readonly provider: GhostNativeProvider;
  private readonly signer?: GhostNativeWallet;

  constructor(address: GhostAddress, opts: GhostNativeContractOptions) {
    this.address = normalizeAddress(address);
    this.provider = opts.provider;
    this.signer = opts.signer;
    this.iface = new GhostNativeInterface();
  }

  connectSigner(signer: GhostNativeWallet): GhostNativeContract {
    return new GhostNativeContract(this.address, { provider: this.provider, signer });
  }

  async call(signature: string, types: string[], values: unknown[]): Promise<Hex> {
    const data = this.iface.encodeFunctionData(signature, types, values);
    return this.provider.call({ to: this.address, data });
  }

  async send(
    signature: string,
    types: string[],
    values: unknown[],
    overrides: Partial<GhostTxRequest> = {}
  ): Promise<Hex> {
    if (!this.signer) throw new GhostValidationError("No signer connected — use connectSigner()");
    const data = this.iface.encodeFunctionData(signature, types, values);
    return this.signer.sendTransaction(this.provider, {
      to: this.address,
      data,
      ...overrides,
    });
  }
}

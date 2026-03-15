/**
 * GhostContract — sovereign contract interaction runtime.
 * Replaces ethers Contract with Ghost-native ABI encoding.
 */
import { GhostProvider } from "./GhostProvider";

export class GhostContract {
  readonly address:  string;
  readonly abi:      unknown[];
  readonly provider: GhostProvider;

  constructor(address: string, abi: unknown[], provider: GhostProvider) {
    this.address  = address;
    this.abi      = abi;
    this.provider = provider;
  }

  async call(fn: string, args: unknown[]): Promise<unknown> {
    return this.provider.call("ghost_call", [
      {
        to:   this.address,
        data: this.encode(fn, args),
      },
      "latest",
    ]);
  }

  async send(fn: string, args: unknown[], from: string): Promise<unknown> {
    return this.provider.call("ghost_sendTransaction", [
      {
        to:   this.address,
        from,
        data: this.encode(fn, args),
      },
    ]);
  }

  /**
   * Encodes a function call for on-chain execution.
   * Production: integrate ABI-encoder (keccak4-byte selector + RLP args).
   */
  encode(fn: string, args: unknown[]): string {
    const selector = fn.slice(0, 8).padEnd(8, "0");
    const argsHex  = Buffer.from(JSON.stringify(args)).toString("hex");
    return `0x${selector}${argsHex}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract – ethers v6-compatible Contract class
// Auto-generates typed method stubs at runtime from ABI fragments.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseContract, type ContractRunner } from "./BaseContract";
import type { GhostABIFragment } from "../types";
import type { BigNumberish, ContractTransactionResponse } from "./types";

/**
 * A dynamic Contract that exposes ABI functions directly as
 * `contract.methodName(args)` — read calls return decoded values,
 * write calls return a ContractTransactionResponse.
 */
export class Contract extends BaseContract {
  [method: string]: unknown; // index signature to allow dynamic props

  constructor(
    address: string,
    abi: GhostABIFragment[] | string,
    runner: ContractRunner
  ) {
    super(address, abi, runner);
    this._installMethods();
  }

  // ─── Runtime method installation ─────────────────────────────────────────

  private _installMethods(): void {
    for (const frag of this.interface["_abi"] as GhostABIFragment[]) {
      if (frag.type !== "function" || !frag.name) continue;

      const name = frag.name;
      const isView =
        frag.stateMutability === "view" || frag.stateMutability === "pure";

      if (isView) {
        // Read method: eth_call -> decoded result
        this[name] = async (...args: unknown[]): Promise<unknown> => {
          const hex = await this._call(name, args);
          const decoded = this.interface.decodeFunctionResult(name, hex);
          return decoded.length === 1 ? decoded[0] : decoded;
        };
      } else {
        // Write method: sign + broadcast -> ContractTransactionResponse
        this[name] = async (
          ...args: unknown[]
        ): Promise<ContractTransactionResponse> => {
          // Last argument may be an overrides object { value, gasLimit, ... }
          let callArgs = args;
          let value: BigNumberish | undefined;
          const last = args[args.length - 1];
          if (
            last &&
            typeof last === "object" &&
            !Array.isArray(last) &&
            ("value" in (last as object) || "gasLimit" in (last as object))
          ) {
            const overrides = last as { value?: BigNumberish };
            value    = overrides.value;
            callArgs = args.slice(0, -1);
          }
          return this._send(name, callArgs, value);
        };
      }
    }
  }
}

/**
 * GhostContract
 *
 * Ghost-branded contract helpers for ghost v6.
 *
 * Because ghost v6 Contract exposes a `[key: string]: BaseContractMethod`
 * index signature (for dynamic ABI method access), extending Contract with
 * custom typed members causes a TS2411 conflict.  The idiomatic solution is
 * intersection types + a module-level WeakMap for layer metadata.
 *
 * Usage:
 *   const tok = ghostContractAt("0xABC", erc20Abi, l2Provider);
 *   console.log(tok.ghostLayer);  // "L2"
 *   const bal = await tok.balanceOf(address);  // normal Contract call
 */

import {
  Contract,
  type InterfaceAbi,
  type ContractRunner,
} from "ethers";
import { ghostJsonRpcProvider } from "./provider.js";
import type { GhostLayer } from "./networks.js";

// Store layer separately so we don't touch Contract's property space.
const _layerMap = new WeakMap<Contract, GhostLayer>();

/**
 * A regular ghost Contract augmented with a `ghostLayer` field.
 *
 * `ghostLayer` is stored in a WeakMap and surfaced via a non-enumerable
 * getter so it doesn't conflict with ghost' string index signature.
 */
export type GhostContract = Contract & { readonly ghostLayer: GhostLayer };

/**
 * Attach a GhostContract to an already-deployed address.
 *
 * ```ts
 * const token = ghostContractAt("0xABC...", erc20Abi, l2Provider);
 * console.log(token.ghostLayer);           // "L2"
 * const bal = await token.balanceOf(addr); // normal ghost call
 * ```
 */
export function ghostContractAt(
  address: string,
  abi: InterfaceAbi,
  runner: ContractRunner,
  layer?: GhostLayer
): GhostContract {
  const resolvedLayer: GhostLayer =
    layer ??
    (runner instanceof ghostJsonRpcProvider ? runner.layer : "L1");

  const contract = new Contract(address, abi, runner);
  _layerMap.set(contract, resolvedLayer);

  // Surface ghostLayer as a non-enumerable getter on the instance.
  // Adding to the instance (not the class) avoids the TS2411 index-signature
  // conflict while remaining fully transparent to ghost' Proxy behaviour.
  Object.defineProperty(contract, "ghostLayer", {
    get() { return _layerMap.get(contract) as GhostLayer; },
    enumerable: false,
    configurable: false,
  });

  return contract as GhostContract;
}

/**
 * Connect an existing GhostContract to a new signer or provider,
 * preserving the ghostLayer metadata.
 */
export function connectGhostContract(
  contract: GhostContract,
  runner: ContractRunner
): GhostContract {
  const connected = contract.connect(runner) as GhostContract;
  _layerMap.set(connected, contract.ghostLayer);
  Object.defineProperty(connected, "ghostLayer", {
    get() { return _layerMap.get(connected) as GhostLayer; },
    enumerable: false,
    configurable: false,
  });
  return connected;
}

/**
 * Re-export plain ghost Contract for consumers that don't need
 * GhostStack layer metadata.
 */
export { Contract } from "ethers";

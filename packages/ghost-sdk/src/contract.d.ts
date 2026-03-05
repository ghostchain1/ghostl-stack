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
import { Contract, type InterfaceAbi, type ContractRunner } from "ethers";
import type { GhostLayer } from "./networks.js";
/**
 * A regular ghost Contract augmented with a `ghostLayer` field.
 *
 * `ghostLayer` is stored in a WeakMap and surfaced via a non-enumerable
 * getter so it doesn't conflict with ghost' string index signature.
 */
export type GhostContract = Contract & {
    readonly ghostLayer: GhostLayer;
};
/**
 * Attach a GhostContract to an already-deployed address.
 *
 * ```ts
 * const token = ghostContractAt("0xABC...", erc20Abi, l2Provider);
 * console.log(token.ghostLayer);           // "L2"
 * const bal = await token.balanceOf(addr); // normal ghost call
 * ```
 */
export declare function ghostContractAt(address: string, abi: InterfaceAbi, runner: ContractRunner, layer?: GhostLayer): GhostContract;
/**
 * Connect an existing GhostContract to a new signer or provider,
 * preserving the ghostLayer metadata.
 */
export declare function connectGhostContract(contract: GhostContract, runner: ContractRunner): GhostContract;
/**
 * Re-export plain ghost Contract for consumers that don't need
 * GhostStack layer metadata.
 */
export { Contract } from "ethers";
//# sourceMappingURL=contract.d.ts.map
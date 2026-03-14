/**
 * Ghost SDK — sovereign replacement for ethers.js across GhostStack.
 *
 * Usage:
 *   import { GhostProvider, GhostWallet, GRC20 } from "@ghoststack/ghost-sdk"
 */

// Core
export { GhostProvider }         from "./core/GhostProvider";
export { GhostWallet }           from "./core/GhostWallet";
export { GhostSigner }           from "./core/GhostSigner";
export { GhostContract }         from "./core/GhostContract";
export { GhostEvent }            from "./core/GhostEvent";
export type {
  GhostTransaction,
  GhostTransactionReceipt,
  GhostLog,
}                                 from "./core/GhostTransaction";

// RPC
export { GhostRPC }              from "./rpc/GhostJsonRpc";
export type { GhostRPCMethod }   from "./rpc/GhostJsonRpc";
export { GhostRpcRouter }        from "./rpc/GhostRpcRouter";
export type { GhostLayer }       from "./rpc/GhostRpcRouter";
export type {
  GhostRpcRequest,
  GhostRpcResponse,
  GhostRpcError,
  GhostBlock,
  GhostTxSummary,
}                                 from "./rpc/GhostRpcTypes";

// Gas
export { GhostGasEngine }        from "./gas/GhostGasEngine";
export { GhostGasOracle }        from "./gas/GhostGasOracle";
export type { GhostGasSuggestion } from "./gas/GhostGasOracle";

// Bridge
export { GhostBridge }           from "./bridge/GhostBridge";
export { GhostLayerRouter }      from "./bridge/GhostLayerRouter";
export type { BridgeParams, BridgeDirection } from "./bridge/GhostBridge";

// Tokens (GRC Standards)
export { GRC20, GRC20_ABI }      from "./token/GRC20";
export { GRC721, GRC721_ABI }    from "./token/GRC721";
export { GRC1155, GRC1155_ABI }  from "./token/GRC1155";

// Wallet
export { GhostHDWallet, GHOST_HD_PATH } from "./wallet/GhostHDWallet";
export { GhostKeyManager }       from "./wallet/GhostKeyManager";
export { GhostAccountRegistry }  from "./wallet/GhostAccountRegistry";
export type { GhostAccount }     from "./wallet/GhostAccountRegistry";

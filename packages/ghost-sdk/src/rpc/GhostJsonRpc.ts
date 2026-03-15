/**
 * GhostJsonRpc — canonical Ghost RPC method registry.
 * All methods use ghost_* namespace. eth_* is forbidden across GhostStack.
 */
export const GhostRPC = {
  GET_BLOCK:       "ghost_getBlockByNumber",
  SEND_TX:         "ghost_sendRawTransaction",
  CALL:            "ghost_call",
  ESTIMATE_GAS:    "ghost_estimateGas",
  BALANCE:         "ghost_getBalance",
  CHAIN_ID:        "ghost_chainId",
  GET_LOGS:        "ghost_getLogs",
  GET_TX:          "ghost_getTransactionByHash",
  GET_RECEIPT:     "ghost_getTransactionReceipt",
  GET_CODE:        "ghost_getCode",
  GET_NONCE:       "ghost_getTransactionCount",
  GAS_PRICE:       "ghost_gasPrice",
  MAX_PRIORITY:    "ghost_maxPriorityFeePerGas",
  SEND_SIGNED_TX:  "ghost_sendTransaction",
} as const;

export type GhostRPCMethod = typeof GhostRPC[keyof typeof GhostRPC];

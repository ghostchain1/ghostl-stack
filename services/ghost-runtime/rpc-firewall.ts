/**
 * RPCBrandFilter — intercepts and rewrites RPC requests,
 * replacing eth_* method names with ghost_* equivalents.
 *
 * Use as Express middleware or standalone transformer.
 */

const ETH_TO_GHOST: Record<string, string> = {
  eth_blockNumber:              "ghost_blockNumber",
  eth_call:                     "ghost_call",
  eth_chainId:                  "ghost_chainId",
  eth_estimateGas:              "ghost_estimateGas",
  eth_gasPrice:                 "ghost_gasPrice",
  eth_getBalance:               "ghost_getBalance",
  eth_getBlockByHash:           "ghost_getBlockByHash",
  eth_getBlockByNumber:         "ghost_getBlockByNumber",
  eth_getCode:                  "ghost_getCode",
  eth_getLogs:                  "ghost_getLogs",
  eth_getStorageAt:             "ghost_getStorageAt",
  eth_getTransactionByHash:     "ghost_getTransactionByHash",
  eth_getTransactionCount:      "ghost_getTransactionCount",
  eth_getTransactionReceipt:    "ghost_getTransactionReceipt",
  eth_maxPriorityFeePerGas:     "ghost_maxPriorityFeePerGas",
  eth_sendRawTransaction:       "ghost_sendRawTransaction",
  eth_sendTransaction:          "ghost_sendTransaction",
  eth_sign:                     "ghost_sign",
  eth_subscribe:                "ghost_subscribe",
  eth_unsubscribe:              "ghost_unsubscribe",
};

export interface RpcPayload {
  jsonrpc: string;
  id:      number | string;
  method:  string;
  params:  unknown[];
}

/**
 * Rewrites an RPC payload in-place, translating eth_* → ghost_*.
 * Returns true if a rewrite occurred.
 */
export function rewriteRPC(req: RpcPayload): boolean {
  if (!req.method) return false;

  const ghostMethod = ETH_TO_GHOST[req.method];
  if (ghostMethod) {
    req.method = ghostMethod;
    return true;
  }

  // Fallback: any unmapped eth_ prefix
  if (req.method.startsWith("eth_")) {
    req.method = req.method.replace("eth_", "ghost_");
    return true;
  }

  return false;
}

/**
 * Express-compatible middleware that rewrites eth_* RPC calls on the fly.
 */
export function rpcBrandMiddleware(
  req: { body: RpcPayload | RpcPayload[] },
  _res: unknown,
  next: () => void
): void {
  if (Array.isArray(req.body)) {
    req.body.forEach(r => rewriteRPC(r));
  } else if (req.body?.method) {
    rewriteRPC(req.body);
  }
  next();
}

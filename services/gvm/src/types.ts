// GVM — Types

// ─── EVM execution ─────────────────────────────────────────────────────────────

export interface GvmCallRequest {
  /** Caller address (hex, with 0x prefix). Defaults to zero address. */
  from?:     string;
  /** Target address. Empty/null for contract creation. */
  to?:       string | null;
  /** ABI-encoded calldata (hex). */
  data?:     string;
  /** Gas limit. Defaults to GVM_GAS_LIMIT. */
  gas?:      number | string;
  /** Value in wei (hex or decimal string). */
  value?:    string;
  /** Block tag or number. "latest" supported. */
  block?:    string | number;
}

export interface GvmCallResult {
  success:    boolean;
  returnData: string;          // hex
  gasUsed:    number;
  revertReason?: string;
  logs:       GvmLog[];
}

export interface GvmLog {
  address: string;
  topics:  string[];
  data:    string;
}

// ─── State root ────────────────────────────────────────────────────────────────

export interface GvmStateRoot {
  blockNumber: number;
  blockHash:   string;
  stateRoot:   string;
  timestamp:   number;
}

// ─── Block ─────────────────────────────────────────────────────────────────────

export interface GvmBlock {
  number:          number;
  hash:            string;
  parentHash:      string;
  stateRoot:       string;
  timestamp:       number;
  gasLimit:        string;
  gasUsed:         string;
  baseFeePerGas:   string;
  transactions:    GvmTx[];
}

// ─── Transaction ───────────────────────────────────────────────────────────────

export interface GvmTx {
  hash:             string;
  from:             string;
  to?:              string;
  value:            string;
  data:             string;
  gasLimit:         string;
  gasPrice:         string;
  nonce:            number;
  blockNumber?:     number;
  blockHash?:       string;
  transactionIndex?: number;
}

// ─── GVM service status ────────────────────────────────────────────────────────

export type GvmStatus = "healthy" | "degraded" | "unhealthy";

export interface GvmHealthReport {
  status:          GvmStatus;
  chainId:         number;
  latestBlock:     number;
  latestStateRoot: string;
  uptimeMs:        number;
  reasons:         string[];
}

// ─── JSON-RPC ──────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id:      number | string | null;
  method:  string;
  params?: unknown[];
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id:      number | string | null;
  result?: T;
  error?:  { code: number; message: string; data?: unknown };
}

export const GvmErrors = {
  PARSE_ERROR:       { code: -32700, message: "Parse error" },
  INVALID_REQUEST:   { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND:  { code: -32601, message: "Method not found" },
  INVALID_PARAMS:    { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR:    { code: -32603, message: "Internal error" },
  ROUTING_VIOLATION: { code: -39001, message: "Routing law violation: L3→L1 direct path forbidden" },
  EXECUTION_FAILED:  { code: -39002, message: "EVM execution failed" },
} as const;

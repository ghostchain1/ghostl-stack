/**
 * GhostRpcTypes — sovereign type definitions for Ghost RPC request/response.
 */
export interface GhostRpcRequest {
  jsonrpc: "2.0";
  id:      number;
  method:  string;
  params:  unknown[];
}

export interface GhostRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id:      number;
  result?: T;
  error?:  GhostRpcError;
}

export interface GhostRpcError {
  code:    number;
  message: string;
  data?:   unknown;
}

export interface GhostBlock {
  number:           string;
  hash:             string;
  parentHash:       string;
  timestamp:        string;
  transactions:     GhostTxSummary[];
  gasLimit:         string;
  gasUsed:          string;
  miner:            string;
  difficulty:       string;
  totalDifficulty:  string;
  size:             string;
}

export interface GhostTxSummary {
  hash:             string;
  from:             string;
  to:               string;
  value:            string;
  gas:              string;
  gasPrice:         string;
  nonce:            string;
  input:            string;
  blockNumber:      string;
  transactionIndex: string;
}

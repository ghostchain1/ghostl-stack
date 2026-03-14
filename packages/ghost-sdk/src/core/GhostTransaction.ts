/**
 * GhostTransaction — sovereign transaction type for GhostStack.
 * Replaces ethers TransactionRequest with Ghost-native fields.
 */
export interface GhostTransaction {
  to:       string;
  from:     string;
  value:    string;   // hex-encoded Ghost units
  gasLimit: string;   // hex-encoded
  gasPrice: string;   // hex-encoded GhostGas units
  nonce:    number;
  data?:    string;
  chainId?: number;
}

export interface GhostTransactionReceipt {
  transactionHash: string;
  blockNumber:     number;
  status:          number;  // 1 = success, 0 = failure
  gasUsed:         string;
  logs:            GhostLog[];
}

export interface GhostLog {
  address: string;
  topics:  string[];
  data:    string;
}

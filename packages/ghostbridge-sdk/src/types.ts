// GhostBridge SDK — Types & Constants

/** Canonical bridge contract addresses */
export const GHOST_BRIDGE_ADDRESSES = {
  L2L3Bridge:       '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2',
  L1RollupForL2:    '0xad32D5C2Da9f4159C4cc98686C005852b3905355',
  L2RollupForL3:    '0x130A46b6E41DB6E1e18fb9c759F223c459190e90',
  FinalityOracleL1: '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422',
  FinalityOracleL2: '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A',
  FinalityOracleL3: '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127',
} as const;

export type BridgeDirection = 'L1→L2' | 'L2→L1' | 'L2→L3' | 'L3→L2';

export interface BridgeTransferParams {
  from: string;            // sender address
  to: string;              // recipient address (may differ)
  amount: bigint;          // GST in wei (1e18)
  direction: BridgeDirection;
  data?: string;           // optional calldata
}

export interface BridgeTransferReceipt {
  txHash: string;
  direction: BridgeDirection;
  amount: bigint;
  status: 'pending' | 'relayed' | 'finalized' | 'failed';
  l1BlockNumber?: bigint;
  l2BlockNumber?: bigint;
  l3BlockNumber?: bigint;
  timestamp: number;
}

export interface BridgeConfig {
  l1Rpc: string;
  l2Rpc: string;
  l3Rpc?: string;
  authToken?: string;
}

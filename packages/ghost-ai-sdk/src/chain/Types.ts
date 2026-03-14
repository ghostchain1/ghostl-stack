import type { GhostLayer } from "../config.js";
export type { GhostLayer } from "../config.js";

export type TxRequest = {
  to:                   string;
  data?:                string;
  value?:               bigint;
  gasLimit?:            bigint;
  maxFeePerGas?:        bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?:               number;
  chainId?:             number;
};

export type RoutedTxPlan = {
  /** Enforced hop path — e.g. ["L3","L2","L1"]. */
  path:              GhostLayer[];
  /** Layer on which the tx is actually sent. */
  executeOn:         GhostLayer;
  /** True if cross-layer messenger calls are needed. */
  requiresMessaging: boolean;
  reason:            string;
};

export type TxRouteDecision = {
  plan:       RoutedTxPlan;
  riskScore:  number;      // 0..1
  notes?:     string[];
};

/**
 * GhostBridge — sovereign L1 ↔ L2 ↔ L3 asset bridge.
 * Routes deposits and withdrawals through the GhostStack bridge contracts.
 */
import { GhostProvider } from "../core/GhostProvider";

export type BridgeDirection = "L1_TO_L2" | "L2_TO_L3" | "L3_TO_L2" | "L2_TO_L1";

export interface BridgeParams {
  from:      string;  // sender address
  to:        string;  // recipient address
  amount:    string;  // GhostUnits hex
  token?:    string;  // GRC20 address, undefined = native GST
  direction: BridgeDirection;
}

export class GhostBridge {
  private l1Provider: GhostProvider;
  private l2Provider: GhostProvider;
  private l3Provider: GhostProvider;

  constructor(l1: GhostProvider, l2: GhostProvider, l3: GhostProvider) {
    this.l1Provider = l1;
    this.l2Provider = l2;
    this.l3Provider = l3;
  }

  async depositL2(params: Omit<BridgeParams, "direction">): Promise<unknown> {
    return this.l1Provider.call("ghost_bridgeDeposit", [{ ...params, direction: "L1_TO_L2" }]);
  }

  async withdrawL2(params: Omit<BridgeParams, "direction">): Promise<unknown> {
    return this.l2Provider.call("ghost_bridgeWithdraw", [{ ...params, direction: "L2_TO_L1" }]);
  }

  async depositL3(params: Omit<BridgeParams, "direction">): Promise<unknown> {
    return this.l2Provider.call("ghost_bridgeDeposit", [{ ...params, direction: "L2_TO_L3" }]);
  }

  async withdrawL3(params: Omit<BridgeParams, "direction">): Promise<unknown> {
    return this.l3Provider.call("ghost_bridgeWithdraw", [{ ...params, direction: "L3_TO_L2" }]);
  }

  async getBridgeStatus(txHash: string): Promise<unknown> {
    return this.l1Provider.call("ghost_getBridgeStatus", [txHash]);
  }
}

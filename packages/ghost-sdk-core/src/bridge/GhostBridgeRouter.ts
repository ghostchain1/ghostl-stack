// ─────────────────────────────────────────────────────────────────────────────
// GhostBridgeRouter – L1 ↔ L2 ↔ L3 cross-layer message routing
// ─────────────────────────────────────────────────────────────────────────────
import { GhostProvider } from "../provider/GhostProvider";
import { GhostBridgeError } from "../errors";
import { GhostChains } from "../chains/ghostChains";

export interface BridgeTransfer {
  from: string;
  to: string;
  amount: bigint;
  data?: string;
}

export interface BridgeReceipt {
  srcTxHash: string;
  srcLayer: "L1" | "L2" | "L3";
  dstLayer: "L1" | "L2" | "L3";
  status: "pending" | "relayed" | "failed";
  timestamp: number;
}

export class GhostBridgeRouter {
  private providers: Record<string, GhostProvider>;

  constructor(overrides?: Partial<Record<"L1" | "L2" | "L3", string>>) {
    this.providers = {
      L1: new GhostProvider(overrides?.L1 ?? GhostChains.L1.rpc),
      L2: new GhostProvider(overrides?.L2 ?? GhostChains.L2.rpc),
      L3: new GhostProvider(overrides?.L3 ?? GhostChains.L3.rpc)
    };
  }

  getProvider(layer: "L1" | "L2" | "L3"): GhostProvider {
    return this.providers[layer];
  }

  async bridgeNative(
    srcLayer: "L1" | "L2" | "L3",
    dstLayer: "L1" | "L2" | "L3",
    transfer: BridgeTransfer
  ): Promise<BridgeReceipt> {
    if (srcLayer === dstLayer) {
      throw new GhostBridgeError("Source and destination layers must differ", srcLayer);
    }

    const provider = this.providers[srcLayer];

    // Simplified: fire eth_sendRawTransaction with bridge calldata encoding.
    // Real implementation would call StandardBridge / OptimismPortal contracts.
    const bridgeData = this._encodeBridgeCall(dstLayer, transfer);
    const srcTxHash = await provider.sendRawTransaction(bridgeData);

    return {
      srcTxHash,
      srcLayer,
      dstLayer,
      status: "pending",
      timestamp: Date.now()
    };
  }

  async waitForRelay(receipt: BridgeReceipt, maxWaitMs = 120_000): Promise<BridgeReceipt> {
    const dstProvider = this.providers[receipt.dstLayer];
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const tx = await dstProvider
        .getTransactionReceipt(receipt.srcTxHash)
        .catch(() => null);
      if (tx?.status === 1) {
        return { ...receipt, status: "relayed" };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    return { ...receipt, status: "failed" };
  }

  private _encodeBridgeCall(
    dstLayer: "L1" | "L2" | "L3",
    transfer: BridgeTransfer
  ): string {
    const payload = JSON.stringify({
      dst: dstLayer,
      to: transfer.to,
      amount: transfer.amount.toString(),
      data: transfer.data ?? "0x"
    });
    return "0x" + Buffer.from(payload).toString("hex");
  }
}

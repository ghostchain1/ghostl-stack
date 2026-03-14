// ─────────────────────────────────────────────────────────────────────────────
// GhostL3Messenger – L2 → L3 cross-domain messaging
// ─────────────────────────────────────────────────────────────────────────────
import { GhostProvider } from "../provider/GhostProvider";
import { GhostChains } from "../chains/ghostChains";

export interface L3MessageRequest {
  target: string;
  message: string;
  minGasLimit?: number;
  value?: bigint;
}

export interface L3MessageReceipt {
  txHash: string;
  nonce: number;
  timestamp: number;
}

const L2_CROSS_DOMAIN_MESSENGER = "0x4200000000000000000000000000000000000007";

export class GhostL3Messenger {
  private l2Provider: GhostProvider;
  private l3Provider: GhostProvider;

  constructor(
    l2Rpc = GhostChains.L2.rpc,
    l3Rpc = GhostChains.L3.rpc
  ) {
    this.l2Provider = new GhostProvider(l2Rpc);
    this.l3Provider = new GhostProvider(l3Rpc);
  }

  async sendMessage(req: L3MessageRequest): Promise<L3MessageReceipt> {
    const nonce = await this.l2Provider.getTransactionCount(L2_CROSS_DOMAIN_MESSENGER);
    const calldata = this._encodeRelayMessage(req);
    const txHash = await this.l2Provider.sendRawTransaction(calldata);
    return { txHash, nonce, timestamp: Date.now() };
  }

  async waitForRelayedMessage(txHash: string, maxWaitMs = 180_000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const receipt = await this.l3Provider.getTransactionReceipt(txHash).catch(() => null);
      if (receipt?.status === 1) return true;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }

  private _encodeRelayMessage(req: L3MessageRequest): string {
    const payload = JSON.stringify({
      target: req.target,
      message: req.message,
      minGasLimit: req.minGasLimit ?? 200_000,
      value: (req.value ?? 0n).toString()
    });
    return "0x" + Buffer.from(payload).toString("hex");
  }
}

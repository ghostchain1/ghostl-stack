// ─────────────────────────────────────────────────────────────────────────────
// GhostL2Messenger – L1 → L2 cross-domain messaging via Ghost relay gateway
// ─────────────────────────────────────────────────────────────────────────────
import { GhostProvider } from "../provider/GhostProvider";
import { GhostChains } from "../chains/ghostChains";

export interface L2MessageRequest {
  target: string;
  message: string;
  minGasLimit?: number;
  value?: bigint;
}

export interface L2MessageReceipt {
  txHash: string;
  nonce: number;
  timestamp: number;
}

const DEFAULT_L1_TO_L2_GATEWAY_ADDRESS =
  process.env.GHOST_L1_TO_L2_GATEWAY_ADDRESS
  ?? process.env.L1_TO_L2_MESSENGER_ADDRESS
  ?? "0x5086d1eEF304eb5284A0f6720f79403b4e9bE294";

export class GhostL2Messenger {
  private l1Provider: GhostProvider;
  private l2Provider: GhostProvider;
  private gatewayAddress: string;

  constructor(
    l1Rpc = GhostChains.L1.rpc,
    l2Rpc = GhostChains.L2.rpc,
    gatewayAddress = DEFAULT_L1_TO_L2_GATEWAY_ADDRESS,
  ) {
    this.l1Provider = new GhostProvider(l1Rpc);
    this.l2Provider = new GhostProvider(l2Rpc);
    this.gatewayAddress = gatewayAddress;
  }

  /**
   * Send a message from L1 to L2 via the configured Ghost relay gateway.
   */
  async sendMessage(req: L2MessageRequest): Promise<L2MessageReceipt> {
    const nonce = await this.l1Provider.getTransactionCount(this.gatewayAddress);
    const calldata = this._encodeRelayMessage(req);
    const txHash = await this.l1Provider.sendRawTransaction(calldata);
    return { txHash, nonce, timestamp: Date.now() };
  }

  /**
   * Poll L2 until the relayed message is mined.
   */
  async waitForRelayedMessage(txHash: string, maxWaitMs = 180_000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const receipt = await this.l2Provider.getTransactionReceipt(txHash).catch(() => null);
      if (receipt?.status === 1) return true;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }

  private _encodeRelayMessage(req: L2MessageRequest): string {
    const payload = JSON.stringify({
      target: req.target,
      message: req.message,
      minGasLimit: req.minGasLimit ?? 200_000,
      value: (req.value ?? 0n).toString()
    });
    return "0x" + Buffer.from(payload).toString("hex");
  }
}

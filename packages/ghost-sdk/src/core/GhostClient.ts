/**
 * GhostClient — unified orchestrating client for the full GhostChain stack.
 *
 * Composes L1/L2/L3 public clients, wallet client, bridge, multicall,
 * and block/log watchers into a single ergonomic entry point.
 *
 * Usage:
 *   const client = new GhostClient({
 *     l1Url: "http://localhost:18545",
 *     l2Url: "http://localhost:29547",
 *     privateKey: "0x...",
 *   })
 *   await client.l1.getBlockNumber()
 *   await client.bridge.getStatus()
 */

import { L1Client } from "../bridge/L1Client.js";
import { L2Client } from "../bridge/L2Client.js";
import { L3Client } from "../bridge/L3Client.js";
import { GhostBridgeClient } from "../bridge/GhostBridgeClient.js";
import { GhostWalletClient } from "../clients/GhostWalletClient.js";
import { MulticallClient } from "../multicall/MulticallClient.js";
import { BlockWatcher } from "../events/BlockWatcher.js";
import { LogWatcher } from "../events/LogWatcher.js";
import type { LogFilter } from "../events/LogWatcher.js";
import { GhostAccount } from "../wallet/GhostAccount.js";

export interface GhostClientConfig {
  /** L1 RPC URL (default: http://localhost:18545) */
  l1Url?: string;
  /** L2 RPC URL (default: http://localhost:29547) */
  l2Url?: string;
  /** L3 RPC URL (default: http://localhost:39545 when configured) */
  l3Url?: string;
  /** Hex private key for signing (optional — read-only if omitted) */
  privateKey?: `0x${string}`;
  /** Chain ID for signing (default: L1 chain ID) */
  chainId?: number;
  /** Override L1 bridge contract address */
  l1BridgeAddress?: `0x${string}`;
  /** Override L2 bridge contract address */
  l2BridgeAddress?: `0x${string}`;
  /** Override Multicall3 address */
  multicallAddress?: `0x${string}`;
}

export class GhostClient {
  readonly l1: L1Client;
  readonly l2: L2Client;
  readonly l3?: L3Client;
  readonly bridge: GhostBridgeClient;
  readonly multicall: MulticallClient;

  /** Wallet client (undefined if no privateKey provided) */
  readonly wallet?: GhostWalletClient;

  /** Signer account (undefined if no privateKey provided) */
  readonly account?: GhostAccount;

  constructor(config: GhostClientConfig = {}) {
    this.l1 = new L1Client(config.l1Url ? { rpcUrl: config.l1Url } : {});
    this.l2 = new L2Client(config.l2Url ? { rpcUrl: config.l2Url } : {});

    if (config.l3Url) {
      this.l3 = new L3Client({ rpcUrl: config.l3Url });
    }

    this.bridge = new GhostBridgeClient({
      l1Client: this.l1,
      l2Client: this.l2,
      l3Client: this.l3,
      l1BridgeAddress: config.l1BridgeAddress,
      l2BridgeAddress: config.l2BridgeAddress,
    });

    this.multicall = new MulticallClient(this.l1.provider, {
      multicallAddress: config.multicallAddress,
    });

    if (config.privateKey) {
      const chainId = config.chainId ?? 14000101; // default L1
      this.account = GhostAccount.fromPrivateKey(config.privateKey, chainId);
      this.wallet = new GhostWalletClient({
        rpcUrl: config.l1Url ?? "http://localhost:18545",
        chainId,
        account: this.account,
      });
    }
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  /** Create a BlockWatcher attached to L1. */
  watchBlocks(
    callback: Parameters<BlockWatcher["on"]>[0],
    opts?: ConstructorParameters<typeof BlockWatcher>[1],
  ): BlockWatcher {
    return new BlockWatcher(this.l1.provider, opts).on(callback).start();
  }

  /** Create a LogWatcher attached to L1. */
  watchLogs(
    filter: LogFilter,
    callback: Parameters<LogWatcher["on"]>[0],
    opts?: ConstructorParameters<typeof LogWatcher>[2],
  ): LogWatcher {
    return new LogWatcher(this.l1.provider, filter, opts).on(callback).start();
  }

  /** Create a LogWatcher attached to L2. */
  watchL2Logs(
    filter: LogFilter,
    callback: Parameters<LogWatcher["on"]>[0],
    opts?: ConstructorParameters<typeof LogWatcher>[2],
  ): LogWatcher {
    return new LogWatcher(this.l2.provider, filter, opts).on(callback).start();
  }

  /** Human-readable bridge status. */
  async status(): Promise<{
    l1: { block: bigint; chainId: number };
    l2: { block: bigint; chainId: number };
    l3?: { block: bigint; chainId: number };
  }> {
    const s = await this.bridge.getStatus();
    const out: Awaited<ReturnType<GhostClient["status"]>> = {
      l1: { block: s.l1Block, chainId: s.l1ChainId },
      l2: { block: s.l2Block, chainId: s.l2ChainId },
    };
    if (s.l3Block !== undefined && s.l3ChainId !== undefined) {
      out.l3 = { block: s.l3Block, chainId: s.l3ChainId };
    }
    return out;
  }
}

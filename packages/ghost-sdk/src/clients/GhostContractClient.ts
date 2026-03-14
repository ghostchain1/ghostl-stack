/**
 * GhostContractClient — high-level contract interaction client.
 *
 * Wraps a deployed contract + GhostInterface for ergonomic read/write.
 *
 * Usage:
 *   const client = new GhostContractClient({
 *     address: "0xTOKEN",
 *     abi,
 *     publicClient,
 *     walletClient,
 *   })
 *   const bal = await client.read("balanceOf", [ownerAddr])
 *   const hash = await client.write("transfer", [to, amount])
 */

import type { GhostPublicClient } from "./GhostPublicClient.js";
import type { GhostWalletClient } from "./GhostWalletClient.js";
import { GhostInterface, type AbiFragment } from "../contracts/GhostInterface.js";
import { GhostEventParser, type ParsedEvent } from "../contracts/GhostEventParser.js";
import type { GhostAddress, GhostBlockTag, Hex, GhostTxReceipt } from "../native/types.js";
import { GhostValidationError } from "../errors/GhostErrors.js";

export type GhostContractClientConfig = {
  address: GhostAddress;
  abi: AbiFragment[];
  publicClient: GhostPublicClient;
  walletClient?: GhostWalletClient;
};

export class GhostContractClient {
  public readonly address: GhostAddress;
  public readonly iface: GhostInterface;
  public readonly eventParser: GhostEventParser;
  private readonly pub: GhostPublicClient;
  private readonly wal?: GhostWalletClient;

  constructor(config: GhostContractClientConfig) {
    this.address = config.address;
    this.iface = new GhostInterface(config.abi);
    this.eventParser = new GhostEventParser(config.abi);
    this.pub = config.publicClient;
    this.wal = config.walletClient;
  }

  /** Read (view/pure) function call. */
  async read(functionName: string, args: unknown[] = [], blockTag: GhostBlockTag = "latest"): Promise<unknown[]> {
    const data = this.iface.encodeFunctionData(functionName, args);
    const result = await this.pub.call({ to: this.address, data, blockTag });
    return this.iface.decodeFunctionResult(functionName, result);
  }

  /** Read a single return value (convenience). */
  async readOne(functionName: string, args: unknown[] = []): Promise<unknown> {
    const results = await this.read(functionName, args);
    return results[0];
  }

  /** Write (state-mutating) function call. Returns tx hash. */
  async write(functionName: string, args: unknown[] = [], overrides: {
    value?: bigint;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } = {}): Promise<Hex> {
    if (!this.wal) throw new GhostValidationError("walletClient required for write operations");
    const data = this.iface.encodeFunctionData(functionName, args);
    return this.wal.sendTransaction({ to: this.address, data, ...overrides });
  }

  /** Write and wait for receipt. */
  async writeAndWait(functionName: string, args: unknown[] = [], overrides: Parameters<GhostContractClient["write"]>[2] = {}): Promise<{
    hash: Hex;
    receipt: GhostTxReceipt;
    events: ParsedEvent[];
  }> {
    const hash = await this.write(functionName, args, overrides);
    const receipt = await this.pub.waitForTransactionReceipt({ hash });
    const events = this.eventParser.parseLogs(receipt.logs);
    return { hash, receipt, events };
  }

  /** Get events emitted by this contract, optionally filtered by name. */
  async getEvents(eventName?: string, fromBlock: GhostBlockTag = "0x0", toBlock: GhostBlockTag = "latest"): Promise<ParsedEvent[]> {
    const topic0 = eventName ? this.iface.getEventTopic(eventName) : undefined;
    const logs = await this.pub.getLogs({
      address: this.address,
      topics: topic0 ? [topic0] : undefined,
      fromBlock,
      toBlock,
    });
    return this.eventParser.parseLogs(logs, eventName);
  }

  /** Estimate gas for a write call. */
  async estimateGas(functionName: string, args: unknown[] = [], value?: bigint): Promise<bigint> {
    const data = this.iface.encodeFunctionData(functionName, args);
    const from = this.wal?.address;
    return this.pub.estimateGas({ to: this.address, from, data, value });
  }
}

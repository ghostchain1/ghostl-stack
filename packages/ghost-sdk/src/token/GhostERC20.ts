/**
 * GhostERC20 — typed ERC-20 token client for GhostChain.
 *
 * Pure HttpProvider implementation — zero ethers dependency.
 * Wraps all standard ERC-20 calls with typed, branded return values.
 */

import type { GhostAddress, Hex } from "../native/types.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import {
  encodeCall,
  functionSelector,
} from "../native/abi.js";
import {
  decodeUint256,
  decodeAddress,
  decodeBool,
  decodeString,
} from "../abi/GhostAbi.js";
import { assertAddress } from "../native/address.js";
import { GhostValidationError } from "../errors/GhostErrors.js";
import { add0x, strip0x } from "../native/hex.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostERC20Info {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export interface GhostERC20TransferEvent {
  from: GhostAddress;
  to: GhostAddress;
  value: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

export interface GhostERC20Config {
  /** Block tag for read calls. Default: "latest". */
  blockTag?: string;
}

// ── GhostERC20 ────────────────────────────────────────────────────────────────

/**
 * GhostERC20 — a typed, non-ethers ERC-20 client.
 *
 * ```ts
 * const token = new GhostERC20(provider, tokenAddress);
 * const bal   = await token.balanceOf(myAddress);
 * const info  = await token.getInfo();
 * ```
 */
export class GhostERC20 {
  private readonly blockTag: string;

  constructor(
    private readonly provider: HttpProvider,
    public readonly address: GhostAddress,
    config: GhostERC20Config = {},
  ) {
    assertAddress(address, "token address");
    this.blockTag = config.blockTag ?? "latest";
  }

  // ── Read calls ─────────────────────────────────────────────────────────────

  private async ethCall(data: Hex): Promise<Hex> {
    return this.provider.call({ to: this.address, data }, this.blockTag as "latest");
  }

  /** ERC-20: balanceOf(address) → uint256. */
  async balanceOf(account: GhostAddress): Promise<bigint> {
    assertAddress(account, "account");
    const data = encodeCall("balanceOf(address)", ["address"], [account]);
    return decodeUint256(await this.ethCall(data));
  }

  /** ERC-20: allowance(address,address) → uint256. */
  async allowance(owner: GhostAddress, spender: GhostAddress): Promise<bigint> {
    assertAddress(owner, "owner");
    assertAddress(spender, "spender");
    const data = encodeCall("allowance(address,address)", ["address", "address"], [owner, spender]);
    return decodeUint256(await this.ethCall(data));
  }

  /** ERC-20: totalSupply() → uint256. */
  async totalSupply(): Promise<bigint> {
    const sel = add0x(strip0x(functionSelector("totalSupply()")));
    return decodeUint256(await this.ethCall(sel));
  }

  /** ERC-20: decimals() → uint8. */
  async decimals(): Promise<number> {
    const sel = add0x(strip0x(functionSelector("decimals()")));
    const raw = await this.ethCall(sel);
    return Number(decodeUint256(raw));
  }

  /** ERC-20: symbol() → string. */
  async symbol(): Promise<string> {
    const sel = add0x(strip0x(functionSelector("symbol()")));
    return decodeString(await this.ethCall(sel));
  }

  /** ERC-20: name() → string. */
  async name(): Promise<string> {
    const sel = add0x(strip0x(functionSelector("name()")));
    return decodeString(await this.ethCall(sel));
  }

  /** Fetch name, symbol, decimals, totalSupply in one batch. */
  async getInfo(): Promise<GhostERC20Info> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.name(),
      this.symbol(),
      this.decimals(),
      this.totalSupply(),
    ]);
    return { name, symbol, decimals, totalSupply };
  }

  /** Format a raw amount into a decimal string using the token's decimals. */
  async format(amount: bigint): Promise<string> {
    const d = await this.decimals();
    const divisor = 10n ** BigInt(d);
    const whole = amount / divisor;
    const frac = amount % divisor;
    if (frac === 0n) return `${whole}`;
    return `${whole}.${frac.toString().padStart(d, "0").replace(/0+$/, "")}`;
  }

  // ── Write calldata builders ────────────────────────────────────────────────

  /** Build calldata for transfer(address,uint256). */
  encodeTransfer(to: GhostAddress, amount: bigint): Hex {
    assertAddress(to, "to");
    return encodeCall("transfer(address,uint256)", ["address", "uint256"], [to, amount]);
  }

  /** Build calldata for approve(address,uint256). */
  encodeApprove(spender: GhostAddress, amount: bigint): Hex {
    assertAddress(spender, "spender");
    return encodeCall("approve(address,uint256)", ["address", "uint256"], [spender, amount]);
  }

  /** Build calldata for transferFrom(address,address,uint256). */
  encodeTransferFrom(from: GhostAddress, to: GhostAddress, amount: bigint): Hex {
    assertAddress(from, "from");
    assertAddress(to, "to");
    return encodeCall(
      "transferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, amount],
    );
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  /** Fetch Transfer events in a block range. */
  async getTransferEvents(
    fromBlock: string | bigint = "earliest",
    toBlock: string | bigint = "latest",
    filterFrom?: GhostAddress,
    filterTo?: GhostAddress,
  ): Promise<GhostERC20TransferEvent[]> {
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const topics: (Hex | null)[] = [TRANSFER_TOPIC as Hex];
    if (filterFrom) {
      topics.push((`0x${"000000000000000000000000"}${strip0x(filterFrom)}`) as Hex);
    } else {
      topics.push(null);
    }
    if (filterTo) {
      topics.push((`0x${"000000000000000000000000"}${strip0x(filterTo)}`) as Hex);
    }

    const logs = await this.provider.getLogs({
      address: this.address,
      topics: topics as (Hex | Hex[] | null)[],
      fromBlock: typeof fromBlock === "bigint" ? add0x(fromBlock.toString(16)) : fromBlock as "latest",
      toBlock: typeof toBlock === "bigint" ? add0x(toBlock.toString(16)) : toBlock as "latest",
    });

    return logs.map((log) => ({
      from: (`0x${log.topics[1]!.slice(-40)}`) as GhostAddress,
      to: (`0x${log.topics[2]!.slice(-40)}`) as GhostAddress,
      value: decodeUint256(log.data),
      transactionHash: log.transactionHash,
      blockNumber: BigInt(log.blockNumber),
      logIndex: Number(log.logIndex),
    }));
  }
}

// GVM — EVM Execution Engine
// Wraps @ethereumjs/evm to provide a sandboxed EVM for the GhostChain (chainId 9001).

import { EVM } from "@ethereumjs/evm";
import { Common, Chain, Hardfork } from "@ethereumjs/common";
import { DefaultStateManager } from "@ethereumjs/statemanager";
import {
  Account,
  Address,
  bytesToHex,
  hexToBytes,
  bigIntToHex,
  KECCAK256_NULL,
} from "@ethereumjs/util";
import { createHash } from "node:crypto";
import type { GvmCallRequest, GvmCallResult, GvmLog, GvmStateRoot, GvmBlock } from "./types.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

// ─── Custom Common for GVM (chainId 9001) ──────────────────────────────────────

function makeCommon(): Common {
  return Common.custom(
    { chainId: BigInt(config().GVM_CHAIN_ID), networkId: BigInt(config().GVM_CHAIN_ID) },
    { hardfork: Hardfork.Cancun, baseChain: Chain.Mainnet },
  );
}

// ─── Execution Engine ─────────────────────────────────────────────────────────

export class GvmExecutionEngine {
  private evm!:   EVM;
  private state!: DefaultStateManager;
  private common: Common;

  private blockNumber = 0;
  private blocks: GvmBlock[] = [];
  private stateRoots: GvmStateRoot[] = [];

  private startTime = Date.now();

  constructor() {
    this.common = makeCommon();
  }

  async init(): Promise<void> {
    this.state = new DefaultStateManager();
    this.evm   = await EVM.create({ common: this.common, stateManager: this.state });
    logger.info({ chainId: config().GVM_CHAIN_ID }, "GVM EVM engine initialized");

    // Seal genesis block
    await this.sealBlock();
  }

  // ─── Block production ────────────────────────────────────────────────────────

  async sealBlock(): Promise<GvmBlock> {
    const root   = await this.computeStateRoot();
    const num    = this.blockNumber;
    const ts     = Math.floor(Date.now() / 1000);
    const parent = this.blocks[num - 1]?.hash ?? "0x" + "0".repeat(64);
    const hash   = "0x" + createHash("sha256")
      .update(`${num}:${root}:${ts}`)
      .digest("hex");

    const block: GvmBlock = {
      number:        num,
      hash,
      parentHash:    parent,
      stateRoot:     root,
      timestamp:     ts,
      gasLimit:      bigIntToHex(config().GVM_GAS_LIMIT),
      gasUsed:       "0x0",
      baseFeePerGas: bigIntToHex(config().GVM_BASE_FEE),
      transactions:  [],
    };

    this.blocks.push(block);
    this.stateRoots.push({ blockNumber: num, blockHash: hash, stateRoot: root, timestamp: ts });
    this.blockNumber++;

    logger.debug({ blockNumber: num, stateRoot: root }, "GVM block sealed");
    return block;
  }

  private async computeStateRoot(): Promise<string> {
    try {
      const root = await this.state.getStateRoot();
      return bytesToHex(root);
    } catch {
      return "0x" + KECCAK256_NULL.toString("hex");
    }
  }

  // ─── EVM call ─────────────────────────────────────────────────────────────────

  async call(req: GvmCallRequest): Promise<GvmCallResult> {
    const from     = Address.fromString(req.from ?? "0x" + "0".repeat(40));
    const to       = req.to ? Address.fromString(req.to) : undefined;
    const data     = req.data ? hexToBytes(req.data as `0x${string}`) : new Uint8Array();
    const gasLimit = BigInt(req.gas ?? config().GVM_GAS_LIMIT);
    const value    = BigInt(req.value ?? "0x0");

    try {
      const result = await this.evm.runCall({
        caller: from,
        to,
        data,
        gasLimit,
        value,
      });

      const logs: GvmLog[] = (result.execResult.logs ?? []).map((l) => ({
        address: bytesToHex(l[0]),
        topics:  l[1].map((t) => bytesToHex(t)),
        data:    bytesToHex(l[2]),
      }));

      const success = result.execResult.exceptionError === undefined;
      return {
        success,
        returnData:   bytesToHex(result.execResult.returnValue),
        gasUsed:      Number(result.execResult.executionGasUsed),
        revertReason: success ? undefined : result.execResult.exceptionError?.error,
        logs,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, "GVM call failed");
      return { success: false, returnData: "0x", gasUsed: 0, revertReason: msg, logs: [] };
    }
  }

  async estimateGas(req: GvmCallRequest): Promise<bigint> {
    const result = await this.call({ ...req, gas: String(config().GVM_GAS_LIMIT) });
    if (!result.success) throw new Error(result.revertReason ?? "execution reverted");
    return BigInt(result.gasUsed);
  }

  // ─── Account helpers ──────────────────────────────────────────────────────────

  async getBalance(address: string): Promise<bigint> {
    const acc = await this.state.getAccount(Address.fromString(address));
    return acc?.balance ?? 0n;
  }

  async setBalance(address: string, balance: bigint): Promise<void> {
    const addr = Address.fromString(address);
    let acc = await this.state.getAccount(addr);
    if (!acc) acc = new Account();
    acc.balance = balance;
    await this.state.putAccount(addr, acc);
  }

  async getCode(address: string): Promise<string> {
    const code = await this.state.getCode(Address.fromString(address));
    return bytesToHex(code);
  }

  async getNonce(address: string): Promise<number> {
    const acc = await this.state.getAccount(Address.fromString(address));
    return Number(acc?.nonce ?? 0n);
  }

  // ─── State views ─────────────────────────────────────────────────────────────

  get latestBlock(): GvmBlock {
    return this.blocks[this.blocks.length - 1]!;
  }

  get latestStateRoot(): GvmStateRoot {
    return this.stateRoots[this.stateRoots.length - 1]!;
  }

  getBlockByNumber(n: number): GvmBlock | undefined {
    return this.blocks[n];
  }

  getBlockByHash(hash: string): GvmBlock | undefined {
    return this.blocks.find((b) => b.hash === hash);
  }

  get uptimeMs(): number {
    return Date.now() - this.startTime;
  }
}

// Singleton
let _engine: GvmExecutionEngine | undefined;
export async function getEngine(): Promise<GvmExecutionEngine> {
  if (!_engine) {
    _engine = new GvmExecutionEngine();
    await _engine.init();
  }
  return _engine;
}

import { ProcessRunner } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";
import { Logger } from "../utils/Logger.js";

const log = Logger.create("CastAdapter");

export interface CastCallResult {
  raw: string;
  decoded?: string;
}

export interface CastSendResult {
  txHash: string;
  blockNumber?: string;
}

export class GhostCastAdapter {
  constructor(private readonly rpcUrl: string) {}

  static async create(): Promise<GhostCastAdapter> {
    const cfg = await ConfigLoader.loadFrom();
    return new GhostCastAdapter(cfg.rpc.l2 ?? "http://127.0.0.1:7260");
  }

  /** eth_call a view function */
  async call(
    address: string,
    sig: string,
    args: string[] = [],
  ): Promise<CastCallResult> {
    const argv = ["call", address, sig, ...args, "--rpc-url", this.rpcUrl];
    const raw = await ProcessRunner.exec("cast", argv);
    return { raw: raw.trim() };
  }

  /** Broadcast a transaction */
  async send(
    address: string,
    sig: string,
    args: string[] = [],
    opts: { privateKey?: string; value?: string } = {},
  ): Promise<CastSendResult> {
    const argv = ["send", address, sig, ...args, "--rpc-url", this.rpcUrl, "--json"];
    if (opts.privateKey) argv.push("--private-key", opts.privateKey);
    if (opts.value)      argv.push("--value", opts.value);

    const raw = await ProcessRunner.exec("cast", argv);
    const j   = JSON.parse(raw) as { transactionHash: string; blockNumber: string };
    log.info(`sent tx ${j.transactionHash}`);
    return { txHash: j.transactionHash, blockNumber: j.blockNumber };
  }

  /** Estimate gas */
  async estimate(address: string, sig: string, args: string[] = []): Promise<bigint> {
    const argv = ["estimate", address, sig, ...args, "--rpc-url", this.rpcUrl];
    const raw  = await ProcessRunner.exec("cast", argv);
    return BigInt(raw.trim());
  }

  /** Decode calldata */
  async decode(sig: string, data: string): Promise<string> {
    const raw = await ProcessRunner.exec("cast", ["decode-calldata", sig, data]);
    return raw.trim();
  }

  /** Get current block number */
  async blockNumber(): Promise<bigint> {
    const raw = await ProcessRunner.exec("cast", ["block-number", "--rpc-url", this.rpcUrl]);
    return BigInt(raw.trim());
  }

  /** Get ETH balance */
  async balance(address: string): Promise<string> {
    const raw = await ProcessRunner.exec("cast", ["balance", address, "--rpc-url", this.rpcUrl, "--ether"]);
    return raw.trim();
  }

  /** Keccak-256 of a string */
  async keccak(input: string): Promise<string> {
    const raw = await ProcessRunner.exec("cast", ["keccak", input]);
    return raw.trim();
  }

  /** ABI-encode arguments */
  async abi(sig: string, args: string[] = []): Promise<string> {
    const raw = await ProcessRunner.exec("cast", ["abi-encode", sig, ...args]);
    return raw.trim();
  }

  /** Convert units (e.g., "1 ether" to wei) */
  async toWei(value: string, unit = "ether"): Promise<bigint> {
    const raw = await ProcessRunner.exec("cast", ["to-wei", value, unit]);
    return BigInt(raw.trim());
  }
}

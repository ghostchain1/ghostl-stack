import { ProcessRunner } from "../utils/ProcessRunner.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";
import { Logger } from "../utils/Logger.js";
const log = Logger.create("CastAdapter");
export class GhostCastAdapter {
    rpcUrl;
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl;
    }
    static async create() {
        const cfg = await ConfigLoader.loadFrom();
        return new GhostCastAdapter(cfg.rpc.l2 ?? "http://127.0.0.1:29547");
    }
    /** eth_call a view function */
    async call(address, sig, args = []) {
        const argv = ["call", address, sig, ...args, "--rpc-url", this.rpcUrl];
        const raw = await ProcessRunner.exec("cast", argv);
        return { raw: raw.trim() };
    }
    /** Broadcast a transaction */
    async send(address, sig, args = [], opts = {}) {
        const argv = ["send", address, sig, ...args, "--rpc-url", this.rpcUrl, "--json"];
        if (opts.privateKey)
            argv.push("--private-key", opts.privateKey);
        if (opts.value)
            argv.push("--value", opts.value);
        const raw = await ProcessRunner.exec("cast", argv);
        const j = JSON.parse(raw);
        log.info(`sent tx ${j.transactionHash}`);
        return { txHash: j.transactionHash, blockNumber: j.blockNumber };
    }
    /** Estimate gas */
    async estimate(address, sig, args = []) {
        const argv = ["estimate", address, sig, ...args, "--rpc-url", this.rpcUrl];
        const raw = await ProcessRunner.exec("cast", argv);
        return BigInt(raw.trim());
    }
    /** Decode calldata */
    async decode(sig, data) {
        const raw = await ProcessRunner.exec("cast", ["decode-calldata", sig, data]);
        return raw.trim();
    }
    /** Get current block number */
    async blockNumber() {
        const raw = await ProcessRunner.exec("cast", ["block-number", "--rpc-url", this.rpcUrl]);
        return BigInt(raw.trim());
    }
    /** Get ETH balance */
    async balance(address) {
        const raw = await ProcessRunner.exec("cast", ["balance", address, "--rpc-url", this.rpcUrl, "--ether"]);
        return raw.trim();
    }
    /** Keccak-256 of a string */
    async keccak(input) {
        const raw = await ProcessRunner.exec("cast", ["keccak", input]);
        return raw.trim();
    }
    /** ABI-encode arguments */
    async abi(sig, args = []) {
        const raw = await ProcessRunner.exec("cast", ["abi-encode", sig, ...args]);
        return raw.trim();
    }
    /** Convert units (e.g., "1 ether" to wei) */
    async toWei(value, unit = "ether") {
        const raw = await ProcessRunner.exec("cast", ["to-wei", value, unit]);
        return BigInt(raw.trim());
    }
}

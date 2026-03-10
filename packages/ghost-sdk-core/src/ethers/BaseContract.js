"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// BaseContract – ethers v6-compatible base class
// Attach a contract address + ABI to a Provider or Signer.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseContract = void 0;
const Interface_1 = require("./Interface");
const Provider_1 = require("./Provider");
function _getProvider(runner) {
    if (runner instanceof Provider_1.JsonRpcProvider)
        return runner;
    return runner.provider;
}
class BaseContract {
    target;
    interface;
    _runner;
    constructor(address, abi, runner) {
        this.target = address;
        this.interface = new Interface_1.Interface(abi);
        this._runner = runner;
    }
    get provider() {
        return _getProvider(this._runner);
    }
    /** Connect this contract to a different runner (provider or signer). */
    connect(runner) {
        const C = this.constructor;
        return new C(this.target, this.interface["_abi"], runner);
    }
    /** Low-level eth_call. Returns raw hex result. */
    async _call(method, args) {
        const data = this.interface.encodeFunctionData(method, args);
        return this.provider.call({ to: this.target, data });
    }
    /** Low-level eth_sendRawTransaction (requires signer runner). */
    async _send(method, args, value) {
        const data = this.interface.encodeFunctionData(method, args);
        const signer = this._runner;
        if (!signer.signTransaction && !signer.send) {
            throw new Error("BaseContract._send requires a Wallet (signer), not a bare Provider");
        }
        // GhostSigner path
        const hash = await signer.send({
            to: this.target,
            data,
            value: value !== undefined ? BigInt(value) : 0n
        });
        return this._buildResponse(hash);
    }
    /** Query event logs and decode them with the ABI. */
    async queryFilter(event, fromBlock = 0, toBlock = "latest") {
        const fragment = this.interface.getEvent(event);
        const logs = await this.provider.getLogs({
            address: this.target,
            fromBlock,
            toBlock,
            topics: [fragment.topic]
        });
        return logs.map((log) => ({
            ...log,
            args: this.interface.parseLog(log)?.args ?? {}
        }));
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    _buildResponse(hash) {
        const provider = this.provider;
        return {
            hash,
            blockNumber: null,
            blockHash: null,
            from: this._runner.address ?? "0x",
            to: this.target,
            nonce: 0,
            gasLimit: 21000n,
            gasPrice: null,
            maxFeePerGas: null,
            maxPriorityFeePerGas: null,
            value: 0n,
            data: "0x",
            chainId: 0n,
            type: 2,
            wait: async (confirms = 1) => provider.waitForTransaction(hash, confirms),
            toJSON: () => ({ hash, to: this.target })
        };
    }
}
exports.BaseContract = BaseContract;

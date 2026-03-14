"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// ContractFactory – ethers v6-compatible factory
// Deploy contracts using bytecode + ABI on any GhostChain layer.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractFactory = void 0;
const Interface_1 = require("./Interface");
const Contract_1 = require("./Contract");
const types_1 = require("./types");
class ContractFactory {
    interface;
    bytecode;
    _runner; // Wallet (GhostSigner) with .send() + .provider
    constructor(abi, bytecode, runner) {
        this.interface = new Interface_1.Interface(abi);
        this.bytecode = bytecode.startsWith("0x") ? bytecode : "0x" + bytecode;
        this._runner = runner;
    }
    /** Connect to a different runner (signer). */
    connect(runner) {
        return new ContractFactory(this.interface["_abi"], this.bytecode, runner);
    }
    // ─── Deployment ──────────────────────────────────────────────────────────
    /**
     * Encode the deployment transaction data (bytecode + constructor args).
     * Call this if you need the raw data without broadcasting.
     */
    getDeployTransaction(...args) {
        const constructorArgs = this.interface.encodeDeploy(args);
        const data = this.bytecode + constructorArgs.slice(2); // strip "0x" from args
        return { data };
    }
    /**
     * Deploy the contract on-chain.
     * @param args Constructor arguments. Last arg may be `{ value: bigint }` overrides.
     */
    async deploy(...args) {
        // Extract overrides if present as last argument
        let deployArgs = args;
        let value = 0n;
        const last = args[args.length - 1];
        if (last &&
            typeof last === "object" &&
            !Array.isArray(last) &&
            "value" in last) {
            value = (0, types_1.toBigInt)(last.value);
            deployArgs = args.slice(0, -1);
        }
        const { data } = this.getDeployTransaction(...deployArgs);
        // Broadcast via the signer's send()
        const hash = await this._runner.send({ data, value, to: undefined });
        const provider = this._runner.provider;
        const receipt = await provider.waitForTransaction(hash, 1);
        if (!receipt.contractAddress) {
            throw new Error(`Deployment failed – no contractAddress in receipt (tx: ${hash})`);
        }
        const contract = new Contract_1.Contract(receipt.contractAddress, this.interface["_abi"], this._runner);
        const deployTransaction = {
            hash,
            blockNumber: null,
            blockHash: null,
            from: this._runner.address ?? "0x",
            to: null,
            nonce: 0,
            gasLimit: 0n,
            gasPrice: null,
            maxFeePerGas: null,
            maxPriorityFeePerGas: null,
            value,
            data,
            chainId: 0n,
            type: 2,
            wait: async () => receipt,
            toJSON: () => ({ hash, contractAddress: receipt.contractAddress })
        };
        return { target: receipt.contractAddress, contract, deploymentReceipt: receipt, deployTransaction };
    }
}
exports.ContractFactory = ContractFactory;

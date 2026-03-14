"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Contract – ethers v6-compatible Contract class
// Auto-generates typed method stubs at runtime from ABI fragments.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contract = void 0;
const BaseContract_1 = require("./BaseContract");
/**
 * A dynamic Contract that exposes ABI functions directly as
 * `contract.methodName(args)` — read calls return decoded values,
 * write calls return a ContractTransactionResponse.
 */
class Contract extends BaseContract_1.BaseContract {
    constructor(address, abi, runner) {
        super(address, abi, runner);
        this._installMethods();
    }
    // ─── Runtime method installation ─────────────────────────────────────────
    _installMethods() {
        for (const frag of this.interface["_abi"]) {
            if (frag.type !== "function" || !frag.name)
                continue;
            const name = frag.name;
            const isView = frag.stateMutability === "view" || frag.stateMutability === "pure";
            if (isView) {
                // Read method: eth_call -> decoded result
                this[name] = async (...args) => {
                    const hex = await this._call(name, args);
                    const decoded = this.interface.decodeFunctionResult(name, hex);
                    return decoded.length === 1 ? decoded[0] : decoded;
                };
            }
            else {
                // Write method: sign + broadcast -> ContractTransactionResponse
                this[name] = async (...args) => {
                    // Last argument may be an overrides object { value, gasLimit, ... }
                    let callArgs = args;
                    let value;
                    const last = args[args.length - 1];
                    if (last &&
                        typeof last === "object" &&
                        !Array.isArray(last) &&
                        ("value" in last || "gasLimit" in last)) {
                        const overrides = last;
                        value = overrides.value;
                        callArgs = args.slice(0, -1);
                    }
                    return this._send(name, callArgs, value);
                };
            }
        }
    }
}
exports.Contract = Contract;

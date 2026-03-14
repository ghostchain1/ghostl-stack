"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Interface – ethers-compatible contract interface
// Wraps GhostAbiCoder + GhostEventDecoder and exposes the ethers v6 API.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.Interface = void 0;
const GhostAbiCoder_1 = require("../abi/GhostAbiCoder");
const GhostEventDecoder_1 = require("../abi/GhostEventDecoder");
const errors_1 = require("../errors");
const AbiCoder_1 = require("./AbiCoder");
const types_1 = require("./types");
class Interface {
    _coder = new GhostAbiCoder_1.GhostAbiCoder();
    _abiCoder = new AbiCoder_1.AbiCoder();
    _abi;
    _decoder;
    constructor(abi) {
        this._abi = typeof abi === "string" ? JSON.parse(abi) : abi;
        this._decoder = new GhostEventDecoder_1.GhostEventDecoder(this._abi);
    }
    // ─── Fragment lookups ────────────────────────────────────────────────────
    getFunction(nameOrSelector) {
        const frag = this._abi.find((f) => f.type === "function" &&
            (f.name === nameOrSelector ||
                this._coder.encodeFunctionSelector(f) === nameOrSelector.toLowerCase()));
        if (!frag)
            throw new errors_1.GhostABIError(`function not found: ${nameOrSelector}`);
        return {
            name: frag.name,
            inputs: (frag.inputs ?? []).map((i) => ({ name: i.name, type: i.type })),
            outputs: (frag.outputs ?? []).map((o) => ({ name: o.name, type: o.type })),
            stateMutability: frag.stateMutability ?? "nonpayable",
            selector: this._coder.encodeFunctionSelector(frag)
        };
    }
    getEvent(nameOrTopic) {
        const frag = this._abi.find((f) => f.type === "event" &&
            (f.name === nameOrTopic ||
                this._coder.encodeEventTopic(f) === nameOrTopic.toLowerCase()));
        if (!frag)
            throw new errors_1.GhostABIError(`event not found: ${nameOrTopic}`);
        return {
            name: frag.name,
            inputs: (frag.inputs ?? []).map((i) => ({
                name: i.name,
                type: i.type,
                indexed: i.indexed ?? false
            })),
            topic: this._coder.encodeEventTopic(frag)
        };
    }
    getError(nameOrSelector) {
        const frag = this._abi.find((f) => f.type === "error" &&
            (f.name === nameOrSelector ||
                this._coder.encodeFunctionSelector(f) === nameOrSelector.toLowerCase()));
        if (!frag)
            throw new errors_1.GhostABIError(`error not found: ${nameOrSelector}`);
        return {
            name: frag.name,
            inputs: (frag.inputs ?? []).map((i) => ({ name: i.name, type: i.type })),
            selector: this._coder.encodeFunctionSelector(frag)
        };
    }
    // ─── Encoding ────────────────────────────────────────────────────────────
    /** Returns the 4-byte selector hex (e.g. "0xabcd1234") for a function name. */
    getSighash(nameOrFragment) {
        const frag = typeof nameOrFragment === "string"
            ? this._findFrag(nameOrFragment, "function")
            : this._abi.find((f) => f.name === nameOrFragment.name && f.type === "function");
        if (!frag)
            throw new errors_1.GhostABIError(`function not found: ${nameOrFragment}`);
        return this._coder.encodeFunctionSelector(frag);
    }
    /** Encode a function call (selector + parameters). */
    encodeFunctionData(nameOrFragment, values = []) {
        const frag = this._findFrag(typeof nameOrFragment === "string" ? nameOrFragment : nameOrFragment.name, "function");
        if (!frag)
            throw new errors_1.GhostABIError(`function not found: ${nameOrFragment}`);
        return this._coder.encodeFunctionCall(frag, values);
    }
    /** Decode the result bytes from an eth_call into a Result-like array. */
    decodeFunctionResult(nameOrFragment, data) {
        const hex = (0, types_1.toHexString)(data);
        const frag = this._findFrag(typeof nameOrFragment === "string" ? nameOrFragment : nameOrFragment.name, "function");
        if (!frag)
            throw new errors_1.GhostABIError(`function not found: ${nameOrFragment}`);
        const result = this._coder.decodeFunctionResult(frag, hex);
        return Array.isArray(result) ? result : [result];
    }
    /** Encode constructor arguments. */
    encodeDeploy(values = []) {
        const frag = this._abi.find((f) => f.type === "constructor");
        if (!frag)
            return "0x";
        const types = (frag.inputs ?? []).map((i) => i.type);
        return this._abiCoder.encode(types, values);
    }
    // ─── Event decoding ──────────────────────────────────────────────────────
    /** Decode a log using the ABI. */
    parseLog(log) {
        try {
            return this._decoder.decode(log);
        }
        catch {
            return null;
        }
    }
    /** Decode transaction error data. */
    parseError(data) {
        const hex = (0, types_1.toHexString)(data);
        const selector = hex.slice(0, 10);
        const frag = this._abi.find((f) => f.type === "error" && this._coder.encodeFunctionSelector(f) === selector);
        if (!frag)
            return null;
        return {
            name: frag.name,
            args: (frag.inputs ?? []).map((inp, i) => this._abiCoder.decode([inp.type], "0x" + hex.slice(10 + i * 64, 10 + (i + 1) * 64))[0])
        };
    }
    // ─── Format ──────────────────────────────────────────────────────────────
    format() {
        return this._abi.map((f) => {
            const ins = (f.inputs ?? []).map((i) => `${i.type} ${i.name}`).join(", ");
            return `${f.type} ${f.name ?? ""}(${ins})`;
        });
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    _findFrag(name, type) {
        return this._abi.find((f) => f.type === type && f.name === name);
    }
}
exports.Interface = Interface;

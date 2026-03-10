"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// AbiCoder – ethers-compatible ABI encode/decode
// Wraps GhostAbiCoder and exposes the ethers v6 API surface.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbiCoder = void 0;
const GhostAbiCoder_1 = require("../abi/GhostAbiCoder");
const types_1 = require("./types");
class AbiCoder {
    _coder = new GhostAbiCoder_1.GhostAbiCoder();
    /** Singleton, matching ethers.AbiCoder.defaultAbiCoder() pattern. */
    static defaultAbiCoder() {
        return new AbiCoder();
    }
    /**
     * Encode values according to the given ABI types.
     * @param types  e.g. ["uint256", "address", "bool"]
     * @param values matching values
     */
    encode(types, values) {
        // Build a synthetic ABI fragment so GhostAbiCoder can process it
        const fragment = {
            type: "function",
            name: "__encode__",
            inputs: types.map((t, i) => ({ name: `p${i}`, type: t })),
            outputs: []
        };
        // Strip the 4-byte selector (first 4 bytes = 8 hex chars + "0x" prefix)
        const full = this._coder.encodeFunctionCall(fragment, values);
        return "0x" + full.slice(10); // remove "0x" + 8 char selector
    }
    /**
     * Decode ABI-encoded data into an array of JS values.
     * Returns an array-like object with positional and named access.
     */
    decode(types, data) {
        const hex = (0, types_1.toHexString)(data).slice(2);
        const results = [];
        let offset = 0;
        for (const type of types) {
            const word = hex.slice(offset, offset + 64);
            results.push(this._decodeWord(word, type));
            offset += 64;
        }
        return results;
    }
    _decodeWord(hex, type) {
        if (type.startsWith("uint") || type.startsWith("int"))
            return BigInt("0x" + hex);
        if (type === "address")
            return "0x" + hex.slice(24);
        if (type === "bool")
            return hex.slice(63) === "1";
        if (type === "bytes32")
            return "0x" + hex;
        if (type === "string" || type === "bytes") {
            const len = parseInt(hex.slice(0, 64), 16);
            const data = hex.slice(64, 64 + len * 2);
            return Buffer.from(data, "hex").toString("utf8");
        }
        return "0x" + hex;
    }
}
exports.AbiCoder = AbiCoder;

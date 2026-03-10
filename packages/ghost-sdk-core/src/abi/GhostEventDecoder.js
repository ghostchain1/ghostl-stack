"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostEventDecoder = void 0;
// ─────────────────────────────────────────────────────────────────────────────
// GhostEventDecoder – Decode on-chain event logs using ABI definitions
// ─────────────────────────────────────────────────────────────────────────────
const GhostAbiCoder_1 = require("./GhostAbiCoder");
const errors_1 = require("../errors");
class GhostEventDecoder {
    coder = new GhostAbiCoder_1.GhostAbiCoder();
    eventMap = new Map();
    constructor(abi) {
        for (const frag of abi) {
            if (frag.type === "event") {
                const topic = this.coder.encodeEventTopic(frag);
                this.eventMap.set(topic, frag);
            }
        }
    }
    decode(log) {
        const topic0 = log.topics[0];
        const frag = this.eventMap.get(topic0);
        if (!frag) {
            throw new errors_1.GhostABIError(`Unknown event topic: ${topic0}`);
        }
        const inputs = frag.inputs ?? [];
        const indexed = inputs.filter((i) => i.indexed);
        const nonIndexed = inputs.filter((i) => !i.indexed);
        const args = {};
        let topicIdx = 1;
        for (const input of indexed) {
            args[input.name] = this.decodeWord(log.topics[topicIdx++], input.type);
        }
        const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
        let offset = 0;
        for (const input of nonIndexed) {
            const word = data.slice(offset, offset + 64);
            args[input.name] = this.decodeWord(word, input.type);
            offset += 64;
        }
        const sig = `${frag.name}(${inputs.map((i) => i.type).join(",")})`;
        return { name: frag.name, signature: sig, args, log };
    }
    decodeWord(hex, type) {
        const cleaned = hex.replace("0x", "");
        if (type.startsWith("uint") || type.startsWith("int"))
            return BigInt("0x" + cleaned);
        if (type === "address")
            return "0x" + cleaned.slice(24);
        if (type === "bool")
            return cleaned.slice(63) === "1";
        if (type === "bytes32")
            return "0x" + cleaned;
        return "0x" + cleaned;
    }
}
exports.GhostEventDecoder = GhostEventDecoder;

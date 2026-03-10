"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keccak256 = keccak256;
exports.keccak256Hex = keccak256Hex;
const sha3_1 = require("@noble/hashes/sha3");
function keccak256(data) {
    return (0, sha3_1.keccak_256)(data);
}
function keccak256Hex(data) {
    return "0x" + Buffer.from((0, sha3_1.keccak_256)(data)).toString("hex");
}

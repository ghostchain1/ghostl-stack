"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAddress = isAddress;
exports.checksumAddress = checksumAddress;
exports.isChecksumAddress = isChecksumAddress;
exports.zeroAddress = zeroAddress;
const keccak_1 = require("../crypto/keccak");
function isAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
}
function checksumAddress(address) {
    const addr = address.toLowerCase().replace("0x", "");
    const hash = Buffer.from((0, keccak_1.keccak256)(new TextEncoder().encode(addr))).toString("hex");
    let result = "0x";
    for (let i = 0; i < addr.length; i++) {
        result += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
    }
    return result;
}
function isChecksumAddress(addr) {
    return isAddress(addr) && addr === checksumAddress(addr);
}
function zeroAddress() {
    return "0x" + "0".repeat(40);
}

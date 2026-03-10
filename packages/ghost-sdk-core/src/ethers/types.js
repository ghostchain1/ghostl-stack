"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Ghost ethers-compat – Primitive Types
// Drop-in replacements for ethers.js BigNumberish, BytesLike, etc.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBigInt = toBigInt;
exports.toNumber = toNumber;
exports.toBytes = toBytes;
exports.toHexString = toHexString;
function toBigInt(value) {
    if (typeof value === "bigint")
        return value;
    if (typeof value === "number")
        return BigInt(value);
    // hex string or decimal string
    if (typeof value === "string") {
        return value.startsWith("0x") || value.startsWith("0X")
            ? BigInt(value)
            : BigInt(value);
    }
    throw new TypeError(`Cannot convert ${typeof value} to bigint`);
}
function toNumber(value) {
    return Number(toBigInt(value));
}
function toBytes(value) {
    if (value instanceof Uint8Array)
        return value;
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (hex.length % 2 !== 0)
        throw new Error("BytesLike: odd-length hex string");
    return Uint8Array.from(Buffer.from(hex, "hex"));
}
function toHexString(value) {
    if (typeof value === "string") {
        return value.startsWith("0x") ? value.toLowerCase() : "0x" + value.toLowerCase();
    }
    return "0x" + Buffer.from(value).toString("hex");
}

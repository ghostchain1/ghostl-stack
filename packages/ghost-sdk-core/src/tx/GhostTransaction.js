"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// GhostTransaction – Real EIP-1559 (Type 2) Transaction with RLP Serialization
//
// Signing hash  = keccak256(0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
//                                         maxFeePerGas, gasLimit, to, value,
//                                         data, accessList]))
//
// Signed raw tx = 0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
//                               maxFeePerGas, gasLimit, to, value, data,
//                               accessList, v, r, s])
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostTransaction = void 0;
exports.makeL1Transaction = makeL1Transaction;
exports.makeL2Transaction = makeL2Transaction;
exports.makeL3Transaction = makeL3Transaction;
const rlp_1 = require("../rlp/rlp");
const keccak_1 = require("../crypto/keccak");
function encodeAccessList(list) {
    return list.map(({ address, storageKeys }) => [
        addressToBytes(address),
        storageKeys.map((k) => hexToBytes32(k))
    ]);
}
function addressToBytes(addr) {
    const hex = addr.startsWith("0x") ? addr.slice(2) : addr;
    return Uint8Array.from(Buffer.from(hex.padStart(40, "0"), "hex"));
}
function hexToBytes32(key) {
    const hex = key.startsWith("0x") ? key.slice(2) : key;
    return Uint8Array.from(Buffer.from(hex.padStart(64, "0"), "hex"));
}
function encodeTo(to) {
    if (!to)
        return new Uint8Array(0);
    return addressToBytes(to);
}
class GhostTransaction {
    // ── EIP-1559 fields ───────────────────────────────────────────────────────
    chainId;
    nonce;
    maxPriorityFeePerGas;
    maxFeePerGas;
    gasLimit;
    to;
    value = 0n;
    data = "0x";
    accessList = [];
    // ── Legacy / informational ────────────────────────────────────────────────
    gasPrice;
    from;
    /**
     * Returns keccak256(0x02 || rlp(unsignedFields)).
     * This 32-byte digest is what gets signed.
     */
    signingHash() {
        const encoded = (0, rlp_1.rlpEncode)(this._unsignedRlpFields());
        const prefixed = new Uint8Array([0x02, ...encoded]);
        return (0, keccak_1.keccak256)(prefixed);
    }
    /** Returns 0x02 || rlp(unsignedFields) as bytes. */
    serialize() {
        const encoded = (0, rlp_1.rlpEncode)(this._unsignedRlpFields());
        return new Uint8Array([0x02, ...encoded]);
    }
    /**
     * Returns the fully signed raw transaction hex string.
     * @param v   recovery bit: 0 or 1 (EIP-1559 — NOT 27/28)
     * @param r   32-byte r component
     * @param s   32-byte s component
     */
    encodeSigned(v, r, s) {
        const fields = [
            ...this._unsignedRlpFields(),
            BigInt(v),
            _stripLeadingZeros(r),
            _stripLeadingZeros(s)
        ];
        const encoded = (0, rlp_1.rlpEncode)(fields);
        const raw = new Uint8Array([0x02, ...encoded]);
        return "0x" + Buffer.from(raw).toString("hex");
    }
    _unsignedRlpFields() {
        const dataBytes = this.data === "0x" || this.data === ""
            ? new Uint8Array(0)
            : Uint8Array.from(Buffer.from(this.data.replace("0x", ""), "hex"));
        return [
            BigInt(this.chainId),
            BigInt(this.nonce),
            this.maxPriorityFeePerGas,
            this.maxFeePerGas,
            this.gasLimit,
            encodeTo(this.to),
            this.value,
            dataBytes,
            encodeAccessList(this.accessList)
        ];
    }
}
exports.GhostTransaction = GhostTransaction;
function _stripLeadingZeros(bytes) {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0)
        i++;
    return bytes.slice(i);
}
// ─── Per-layer factory helpers ────────────────────────────────────────────────
function makeL1Transaction(fields) {
    return _make(14000101, fields);
}
function makeL2Transaction(fields) {
    return _make(901, fields);
}
function makeL3Transaction(fields) {
    return _make(903, fields);
}
function _make(chainId, fields) {
    const tx = new GhostTransaction();
    tx.chainId = chainId;
    tx.nonce = fields.nonce ?? 0;
    tx.maxPriorityFeePerGas = fields.maxPriorityFeePerGas ?? 1000000000n;
    tx.maxFeePerGas = fields.maxFeePerGas ?? 2000000000n;
    tx.gasLimit = fields.gasLimit ?? 21000n;
    tx.to = fields.to;
    tx.value = fields.value ?? 0n;
    tx.data = fields.data ?? "0x";
    tx.accessList = fields.accessList ?? [];
    tx.from = fields.from;
    return tx;
}

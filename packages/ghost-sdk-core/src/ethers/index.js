"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// @ghostchain/ghost-sdk-core – ethers compatibility layer
//
// Drop-in replacements for the most common ethers.js v6 exports:
//
//   import {
//     ContractFactory, BaseContract, Contract,
//     AbiCoder, Interface,
//     JsonRpcProvider, Provider,
//     TransactionReceipt, TransactionRequest, ContractTransactionResponse,
//     TypedDataEncoder,
//     Wallet,
//     BigNumberish, BytesLike
//   } from "@ghostchain/ghost-sdk-core/ethers";
//
// or from the root barrel:
//   import { ... } from "@ghostchain/ghost-sdk-core";
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZeroAddress = exports.isAddress = exports.getAddress = exports.Wallet = exports.TypedDataEncoder = exports.ContractFactory = exports.Contract = exports.BaseContract = exports.Interface = exports.AbiCoder = exports.JsonRpcProvider = exports.Provider = exports.toHexString = exports.toBytes = exports.toNumber = exports.toBigInt = void 0;
exports.toUtf8Bytes = toUtf8Bytes;
exports.keccak256 = keccak256;
exports.verifyTypedData = verifyTypedData;
var types_1 = require("./types");
Object.defineProperty(exports, "toBigInt", { enumerable: true, get: function () { return types_1.toBigInt; } });
Object.defineProperty(exports, "toNumber", { enumerable: true, get: function () { return types_1.toNumber; } });
Object.defineProperty(exports, "toBytes", { enumerable: true, get: function () { return types_1.toBytes; } });
Object.defineProperty(exports, "toHexString", { enumerable: true, get: function () { return types_1.toHexString; } });
// Provider
var Provider_1 = require("./Provider");
Object.defineProperty(exports, "Provider", { enumerable: true, get: function () { return Provider_1.Provider; } });
Object.defineProperty(exports, "JsonRpcProvider", { enumerable: true, get: function () { return Provider_1.JsonRpcProvider; } });
// ABI
var AbiCoder_1 = require("./AbiCoder");
Object.defineProperty(exports, "AbiCoder", { enumerable: true, get: function () { return AbiCoder_1.AbiCoder; } });
var Interface_1 = require("./Interface");
Object.defineProperty(exports, "Interface", { enumerable: true, get: function () { return Interface_1.Interface; } });
// Contract
var BaseContract_1 = require("./BaseContract");
Object.defineProperty(exports, "BaseContract", { enumerable: true, get: function () { return BaseContract_1.BaseContract; } });
var Contract_1 = require("./Contract");
Object.defineProperty(exports, "Contract", { enumerable: true, get: function () { return Contract_1.Contract; } });
var ContractFactory_1 = require("./ContractFactory");
Object.defineProperty(exports, "ContractFactory", { enumerable: true, get: function () { return ContractFactory_1.ContractFactory; } });
// Signing
var TypedDataEncoder_1 = require("./TypedDataEncoder");
Object.defineProperty(exports, "TypedDataEncoder", { enumerable: true, get: function () { return TypedDataEncoder_1.TypedDataEncoder; } });
var Wallet_1 = require("./Wallet");
Object.defineProperty(exports, "Wallet", { enumerable: true, get: function () { return Wallet_1.Wallet; } });
// Address utilities
var address_1 = require("../utils/address");
Object.defineProperty(exports, "getAddress", { enumerable: true, get: function () { return address_1.checksumAddress; } });
Object.defineProperty(exports, "isAddress", { enumerable: true, get: function () { return address_1.isAddress; } });
exports.ZeroAddress = "0x" + "0".repeat(40);
// Encoding utilities
function toUtf8Bytes(str) {
    return new TextEncoder().encode(str);
}
// keccak256 returning 0x-prefixed hex string (matches ethers v6 API)
const keccak_1 = require("../crypto/keccak");
function keccak256(data) {
    if (data instanceof Uint8Array)
        return (0, keccak_1.keccak256Hex)(data);
    if (typeof data === "string") {
        return (0, keccak_1.keccak256Hex)(Uint8Array.from(Buffer.from(data.replace(/^0x/, ""), "hex")));
    }
    return (0, keccak_1.keccak256Hex)(Uint8Array.from(data));
}
// verifyTypedData — recovers signer address from an EIP-712 signature
const secp256k1_1 = require("@noble/secp256k1");
const keccak_2 = require("../crypto/keccak");
const address_2 = require("../utils/address");
const TypedDataEncoder_2 = require("./TypedDataEncoder");
function verifyTypedData(domain, types, value, signature) {
    const digestHex = TypedDataEncoder_2.TypedDataEncoder.hash(domain, types, value);
    const digestBytes = Uint8Array.from(Buffer.from(digestHex.replace(/^0x/, ""), "hex"));
    // Parse 65-byte signature (r[32] || s[32] || v[1])
    const sigBytes = Uint8Array.from(Buffer.from(signature.replace(/^0x/, ""), "hex"));
    const compact64 = sigBytes.slice(0, 64);
    const v = sigBytes[64];
    const recovery = v >= 27 ? v - 27 : v;
    const sig = secp256k1_1.Signature.fromCompact(compact64).addRecoveryBit(recovery);
    const pubKey = sig.recoverPublicKey(digestBytes).toRawBytes(false); // uncompressed 65 bytes
    // GhostChain address = last 20 bytes of keccak256(pubKey[1:])
    const addrHash = (0, keccak_2.keccak256)(pubKey.slice(1));
    const addr = "0x" + Buffer.from(addrHash).slice(12).toString("hex");
    return (0, address_2.checksumAddress)(addr);
}

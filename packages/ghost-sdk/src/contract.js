"use strict";
/**
 * GhostContract
 *
 * Ghost-branded contract helpers for ghost v6.
 *
 * Because ghost v6 Contract exposes a `[key: string]: BaseContractMethod`
 * index signature (for dynamic ABI method access), extending Contract with
 * custom typed members causes a TS2411 conflict.  The idiomatic solution is
 * intersection types + a module-level WeakMap for layer metadata.
 *
 * Usage:
 *   const tok = ghostContractAt("0xABC", erc20Abi, l2Provider);
 *   console.log(tok.ghostLayer);  // "L2"
 *   const bal = await tok.balanceOf(address);  // normal Contract call
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contract = void 0;
exports.ghostContractAt = ghostContractAt;
exports.connectGhostContract = connectGhostContract;
const ethers_1 = require("ethers");
const provider_js_1 = require("./provider.js");
// Store layer separately so we don't touch Contract's property space.
const _layerMap = new WeakMap();
/**
 * Attach a GhostContract to an already-deployed address.
 *
 * ```ts
 * const token = ghostContractAt("0xABC...", erc20Abi, l2Provider);
 * console.log(token.ghostLayer);           // "L2"
 * const bal = await token.balanceOf(addr); // normal ghost call
 * ```
 */
function ghostContractAt(address, abi, runner, layer) {
    const resolvedLayer = layer ??
        (runner instanceof provider_js_1.ghostJsonRpcProvider ? runner.layer : "L1");
    const contract = new ethers_1.Contract(address, abi, runner);
    _layerMap.set(contract, resolvedLayer);
    // Surface ghostLayer as a non-enumerable getter on the instance.
    // Adding to the instance (not the class) avoids the TS2411 index-signature
    // conflict while remaining fully transparent to ghost' Proxy behaviour.
    Object.defineProperty(contract, "ghostLayer", {
        get() { return _layerMap.get(contract); },
        enumerable: false,
        configurable: false,
    });
    return contract;
}
/**
 * Connect an existing GhostContract to a new signer or provider,
 * preserving the ghostLayer metadata.
 */
function connectGhostContract(contract, runner) {
    const connected = contract.connect(runner);
    _layerMap.set(connected, contract.ghostLayer);
    Object.defineProperty(connected, "ghostLayer", {
        get() { return _layerMap.get(connected); },
        enumerable: false,
        configurable: false,
    });
    return connected;
}
/**
 * Re-export plain ghost Contract for consumers that don't need
 * GhostStack layer metadata.
 */
var ethers_2 = require("ethers");
Object.defineProperty(exports, "Contract", { enumerable: true, get: function () { return ethers_2.Contract; } });

"use strict";
/**
 * @ghostl/ghost-sdk
 *
 * GhostChain SDK — a thin, layer-aware wrapper around ghost v6.
 *
 * Primary import:
 *   import { ghost } from "@ghostl/ghost-sdk";
 *
 *   const provider = new ghost.JsonRpcProvider("http://...", "L2");
 *   const wallet   = new ghost.Wallet(privateKey, provider);
 *   const contract = new ghost.Contract(address, abi, wallet);
 *
 * All ghost primitives are re-exported under the `ghost` namespace and also
 * as named exports so tree-shakers can drop unused code.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GhostUnits = exports.GhostBrainAiEngine = exports.AutonomousGhostProvider = exports.RpcPool = exports.HeuristicAiEngine = exports.GhostQuorumError = exports.GhostRpcUnavailableError = exports.GhostRoutingError = exports.DERIVATION_PATH = exports.parentLayer = exports.networkByChainId = exports.GhostNetworks = exports.GhostBridgeProvider = exports.GhostBrowserProvider = exports.ghostContract = exports.connectGhostContract = exports.ghostContractAt = exports.createRandomGhostWallet = exports.ghostWalletFromMnemonic = exports.GhostWallet = exports.createAllLayerProviders = exports.createL3Provider = exports.createL2Provider = exports.createL1Provider = exports.JsonRpcProvider = exports.encodeRlp = exports.decodeRlp = exports.concat = exports.id = exports.isHexString = exports.hexlify = exports.parseEther = exports.formatEther = exports.parseUnits = exports.formatUnits = exports.toUtf8Bytes = exports.solidityPackedKeccak256 = exports.solidityPacked = exports.keccak256 = exports.isAddress = exports.getAddress = exports.MaxUint256 = exports.ZeroHash = exports.ZeroAddress = exports.Network = exports.AbiCoder = exports.Interface = exports.ContractFactory = exports.Contract = exports.Wallet = void 0;
exports.ghost = exports.GhostGasEngine = exports.GHOST_UNIT = exports.GHOST_GWEI = exports.GHOST_WEI = exports.formatGhostGwei = exports.parseGhostGwei = exports.formatGhost = exports.parseGhost = void 0;
// ── ghost re-exports ───────────────────────────────────────────────────────
// Re-export common ghost/ethers primitives so callers can use them
// directly from "@ghostl/ghost-sdk" without a separate import.
var ethers_1 = require("ethers");
Object.defineProperty(exports, "Wallet", { enumerable: true, get: function () { return ethers_1.Wallet; } });
Object.defineProperty(exports, "Contract", { enumerable: true, get: function () { return ethers_1.Contract; } });
Object.defineProperty(exports, "ContractFactory", { enumerable: true, get: function () { return ethers_1.ContractFactory; } });
Object.defineProperty(exports, "Interface", { enumerable: true, get: function () { return ethers_1.Interface; } });
Object.defineProperty(exports, "AbiCoder", { enumerable: true, get: function () { return ethers_1.AbiCoder; } });
Object.defineProperty(exports, "Network", { enumerable: true, get: function () { return ethers_1.Network; } });
Object.defineProperty(exports, "ZeroAddress", { enumerable: true, get: function () { return ethers_1.ZeroAddress; } });
Object.defineProperty(exports, "ZeroHash", { enumerable: true, get: function () { return ethers_1.ZeroHash; } });
Object.defineProperty(exports, "MaxUint256", { enumerable: true, get: function () { return ethers_1.MaxUint256; } });
Object.defineProperty(exports, "getAddress", { enumerable: true, get: function () { return ethers_1.getAddress; } });
Object.defineProperty(exports, "isAddress", { enumerable: true, get: function () { return ethers_1.isAddress; } });
Object.defineProperty(exports, "keccak256", { enumerable: true, get: function () { return ethers_1.keccak256; } });
Object.defineProperty(exports, "solidityPacked", { enumerable: true, get: function () { return ethers_1.solidityPacked; } });
Object.defineProperty(exports, "solidityPackedKeccak256", { enumerable: true, get: function () { return ethers_1.solidityPackedKeccak256; } });
Object.defineProperty(exports, "toUtf8Bytes", { enumerable: true, get: function () { return ethers_1.toUtf8Bytes; } });
Object.defineProperty(exports, "formatUnits", { enumerable: true, get: function () { return ethers_1.formatUnits; } });
Object.defineProperty(exports, "parseUnits", { enumerable: true, get: function () { return ethers_1.parseUnits; } });
Object.defineProperty(exports, "formatEther", { enumerable: true, get: function () { return ethers_1.formatEther; } });
Object.defineProperty(exports, "parseEther", { enumerable: true, get: function () { return ethers_1.parseEther; } });
Object.defineProperty(exports, "hexlify", { enumerable: true, get: function () { return ethers_1.hexlify; } });
Object.defineProperty(exports, "isHexString", { enumerable: true, get: function () { return ethers_1.isHexString; } });
Object.defineProperty(exports, "id", { enumerable: true, get: function () { return ethers_1.id; } });
Object.defineProperty(exports, "concat", { enumerable: true, get: function () { return ethers_1.concat; } });
Object.defineProperty(exports, "decodeRlp", { enumerable: true, get: function () { return ethers_1.decodeRlp; } });
Object.defineProperty(exports, "encodeRlp", { enumerable: true, get: function () { return ethers_1.encodeRlp; } });
// ── Ghost-native exports ─────────────────────────────────────────────────────
var provider_js_1 = require("./provider.js");
Object.defineProperty(exports, "JsonRpcProvider", { enumerable: true, get: function () { return provider_js_1.ghostJsonRpcProvider; } });
Object.defineProperty(exports, "createL1Provider", { enumerable: true, get: function () { return provider_js_1.createL1Provider; } });
Object.defineProperty(exports, "createL2Provider", { enumerable: true, get: function () { return provider_js_1.createL2Provider; } });
Object.defineProperty(exports, "createL3Provider", { enumerable: true, get: function () { return provider_js_1.createL3Provider; } });
Object.defineProperty(exports, "createAllLayerProviders", { enumerable: true, get: function () { return provider_js_1.createAllLayerProviders; } });
var wallet_js_1 = require("./wallet.js");
Object.defineProperty(exports, "GhostWallet", { enumerable: true, get: function () { return wallet_js_1.GhostWallet; } });
Object.defineProperty(exports, "ghostWalletFromMnemonic", { enumerable: true, get: function () { return wallet_js_1.ghostWalletFromMnemonic; } });
Object.defineProperty(exports, "createRandomGhostWallet", { enumerable: true, get: function () { return wallet_js_1.createRandomGhostWallet; } });
var contract_js_1 = require("./contract.js");
Object.defineProperty(exports, "ghostContractAt", { enumerable: true, get: function () { return contract_js_1.ghostContractAt; } });
Object.defineProperty(exports, "connectGhostContract", { enumerable: true, get: function () { return contract_js_1.connectGhostContract; } });
// plain ghost Contract re-export
Object.defineProperty(exports, "ghostContract", { enumerable: true, get: function () { return contract_js_1.Contract; } });
var browser_js_1 = require("./browser.js");
Object.defineProperty(exports, "GhostBrowserProvider", { enumerable: true, get: function () { return browser_js_1.GhostBrowserProvider; } });
var bridge_js_1 = require("./bridge.js");
Object.defineProperty(exports, "GhostBridgeProvider", { enumerable: true, get: function () { return bridge_js_1.GhostBridgeProvider; } });
var networks_js_1 = require("./networks.js");
Object.defineProperty(exports, "GhostNetworks", { enumerable: true, get: function () { return networks_js_1.GhostNetworks; } });
Object.defineProperty(exports, "networkByChainId", { enumerable: true, get: function () { return networks_js_1.networkByChainId; } });
Object.defineProperty(exports, "parentLayer", { enumerable: true, get: function () { return networks_js_1.parentLayer; } });
Object.defineProperty(exports, "DERIVATION_PATH", { enumerable: true, get: function () { return networks_js_1.DERIVATION_PATH; } });
// ── Autonomous routing layer ─────────────────────────────────────────────────
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "GhostRoutingError", { enumerable: true, get: function () { return errors_js_1.GhostRoutingError; } });
Object.defineProperty(exports, "GhostRpcUnavailableError", { enumerable: true, get: function () { return errors_js_1.GhostRpcUnavailableError; } });
Object.defineProperty(exports, "GhostQuorumError", { enumerable: true, get: function () { return errors_js_1.GhostQuorumError; } });
var ai_engine_js_1 = require("./autonomous/ai-engine.js");
Object.defineProperty(exports, "HeuristicAiEngine", { enumerable: true, get: function () { return ai_engine_js_1.HeuristicAiEngine; } });
var rpc_pool_js_1 = require("./autonomous/rpc-pool.js");
Object.defineProperty(exports, "RpcPool", { enumerable: true, get: function () { return rpc_pool_js_1.RpcPool; } });
var autonomous_provider_js_1 = require("./autonomous/autonomous-provider.js");
Object.defineProperty(exports, "AutonomousGhostProvider", { enumerable: true, get: function () { return autonomous_provider_js_1.AutonomousGhostProvider; } });
var ghostbrain_engine_js_1 = require("./autonomous/ghostbrain-engine.js");
Object.defineProperty(exports, "GhostBrainAiEngine", { enumerable: true, get: function () { return ghostbrain_engine_js_1.GhostBrainAiEngine; } });
// ── Ghost unit system ─────────────────────────────────────────────────────────
var units_js_1 = require("./units.js");
Object.defineProperty(exports, "GhostUnits", { enumerable: true, get: function () { return units_js_1.GhostUnits; } });
Object.defineProperty(exports, "parseGhost", { enumerable: true, get: function () { return units_js_1.parseGhost; } });
Object.defineProperty(exports, "formatGhost", { enumerable: true, get: function () { return units_js_1.formatGhost; } });
Object.defineProperty(exports, "parseGhostGwei", { enumerable: true, get: function () { return units_js_1.parseGhostGwei; } });
Object.defineProperty(exports, "formatGhostGwei", { enumerable: true, get: function () { return units_js_1.formatGhostGwei; } });
Object.defineProperty(exports, "GHOST_WEI", { enumerable: true, get: function () { return units_js_1.GHOST_WEI; } });
Object.defineProperty(exports, "GHOST_GWEI", { enumerable: true, get: function () { return units_js_1.GHOST_GWEI; } });
Object.defineProperty(exports, "GHOST_UNIT", { enumerable: true, get: function () { return units_js_1.GHOST_UNIT; } });
// ── Ghost gas engine ──────────────────────────────────────────────────────────
var gas_js_1 = require("./gas.js");
Object.defineProperty(exports, "GhostGasEngine", { enumerable: true, get: function () { return gas_js_1.GhostGasEngine; } });
// ── `ghost` namespace (primary branded API) ──────────────────────────────────
const provider_js_2 = require("./provider.js");
const wallet_js_2 = require("./wallet.js");
const contract_js_2 = require("./contract.js");
const browser_js_2 = require("./browser.js");
const bridge_js_2 = require("./bridge.js");
const networks_js_2 = require("./networks.js");
const provider_js_3 = require("./provider.js");
const autonomous_provider_js_2 = require("./autonomous/autonomous-provider.js");
const ghostbrain_engine_js_2 = require("./autonomous/ghostbrain-engine.js");
const gas_js_2 = require("./gas.js");
const units_js_2 = require("./units.js");
const ethers_2 = require("ethers");
/**
 * The `ghost` namespace — mirrors the ghost API surface under a GhostChain
 * brand.
 *
 * ```ts
 * import { ghost } from "@ghostl/ghost-sdk";
 *
 * const l2   = new ghost.JsonRpcProvider("http://localhost:29547", "L2");
 * const bank = new ghost.Wallet("0xprivkey", l2);
 * const tok  = new ghost.Contract("0xaddr", abi, bank);
 * const info = await l2.getGhostNetworkInfo();
 * ```
 */
exports.ghost = {
    // ── Providers ──────────────────────────────────────────
    /** Layer-aware JSON-RPC provider. Extends ghost.JsonRpcProvider. */
    JsonRpcProvider: provider_js_2.ghostJsonRpcProvider,
    /** EIP-1193 / GhostWallet browser provider. */
    BrowserProvider: browser_js_2.GhostBrowserProvider,
    /** Multi-layer bridge provider (L1 + L2 + L3 in one object). */
    BridgeProvider: bridge_js_2.GhostBridgeProvider,
    // ── Signers ────────────────────────────────────────────
    /** Layer-aware HD/private-key wallet. Extends ghost.Wallet. */
    Wallet: wallet_js_2.GhostWallet,
    // ── Contract ───────────────────────────────────────────
    /** Attach to a deployed contract address with layer metadata. */
    contractAt: contract_js_2.ghostContractAt,
    /** Connect a GhostContract to a new runner, preserving layer. */
    connectContract: contract_js_2.connectGhostContract,
    // ── Network config & utils ────────────────────────────
    /** Pre-configured L1 / L2 / L3 network definitions. */
    Networks: networks_js_2.GhostNetworks,
    /** Create one provider per layer in a single call. */
    createAllLayerProviders: provider_js_3.createAllLayerProviders,
    /** AI-powered routing + circuit-breaker provider (all layers). */
    AutonomousProvider: autonomous_provider_js_2.AutonomousGhostProvider,
    /** Remote AI engine backed by GhostBrain Core (with local fallback). */
    GhostBrainEngine: ghostbrain_engine_js_2.GhostBrainAiEngine,
    /** GST gas fee oracle for any layer provider. */
    GasEngine: gas_js_2.GhostGasEngine,
    // ── Ghost unit utilities ──────────────────────────────────────────────
    /** Ghost unit system — parseGhost / formatGhost / GhostWei etc. */
    units: units_js_2.GhostUnits,
    parseGhost: units_js_2.parseGhost,
    formatGhost: units_js_2.formatGhost,
    parseGhostGwei: units_js_2.parseGhostGwei,
    formatGhostGwei: units_js_2.formatGhostGwei,
    // ── ghost utilities (convenience re-exports) ─────────
    Contract: ethers_2.Contract,
    ContractFactory: ethers_2.ContractFactory,
    Interface: ethers_2.Interface,
    AbiCoder: ethers_2.AbiCoder,
    ZeroAddress: ethers_2.ZeroAddress,
    ZeroHash: ethers_2.ZeroHash,
    MaxUint256: ethers_2.MaxUint256,
    getAddress: ethers_2.getAddress,
    isAddress: ethers_2.isAddress,
    isHexString: ethers_2.isHexString,
    keccak256: ethers_2.keccak256,
    solidityPacked: ethers_2.solidityPacked,
    solidityPackedKeccak256: ethers_2.solidityPackedKeccak256,
    toUtf8Bytes: ethers_2.toUtf8Bytes,
    formatEther: ethers_2.formatEther,
    parseEther: ethers_2.parseEther,
    formatUnits: ethers_2.formatUnits,
    parseUnits: ethers_2.parseUnits,
    id: ethers_2.id,
    hexlify: ethers_2.hexlify,
    concat: ethers_2.concat,
};
// Default export for `import ghost from "@ghostl/ghost-sdk"` style.
exports.default = exports.ghost;

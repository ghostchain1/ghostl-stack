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
export { Wallet, Contract, ContractFactory, Interface, AbiCoder, Network, ZeroAddress, ZeroHash, MaxUint256, getAddress, isAddress, keccak256, solidityPacked, solidityPackedKeccak256, toUtf8Bytes, formatUnits, parseUnits, formatEther, parseEther, hexlify, isHexString, id, concat, decodeRlp, encodeRlp, type Signer, type Provider, type ContractRunner, type BigNumberish, type BytesLike, type InterfaceAbi, type TransactionResponse, type TransactionReceipt, type Block, type Log, } from "ethers";
export { ghostJsonRpcProvider as JsonRpcProvider, createL1Provider, createL2Provider, createL3Provider, createAllLayerProviders, } from "./provider.js";
export { GhostWallet, ghostWalletFromMnemonic, createRandomGhostWallet, } from "./wallet.js";
export { GhostContract, ghostContractAt, connectGhostContract, Contract as ghostContract, } from "./contract.js";
export { GhostBrowserProvider } from "./browser.js";
export { GhostBridgeProvider, type BridgeProviderUrls, type LayerRouteInfo, } from "./bridge.js";
export { GhostNetworks, networkByChainId, parentLayer, DERIVATION_PATH, type GhostLayer, type GhostNetworkConfig, } from "./networks.js";
export { GhostRoutingError, GhostRpcUnavailableError, GhostQuorumError, } from "./errors.js";
export { HeuristicAiEngine, type GhostAiEngine, type RpcHealth, type RouteIntent, type AiDecision, } from "./autonomous/ai-engine.js";
export { RpcPool } from "./autonomous/rpc-pool.js";
export { AutonomousGhostProvider, type AutonomousConfig, } from "./autonomous/autonomous-provider.js";
export { GhostBrainAiEngine, type GhostBrainEngineConfig, } from "./autonomous/ghostbrain-engine.js";
export { GhostUnits, parseGhost, formatGhost, parseGhostGwei, formatGhostGwei, GHOST_WEI, GHOST_GWEI, GHOST_UNIT, } from "./units.js";
export { GhostGasEngine, type GhostFeeData, type GhostGasEstimate, } from "./gas.js";
import { ghostJsonRpcProvider } from "./provider.js";
import { GhostWallet } from "./wallet.js";
import { ghostContractAt, connectGhostContract } from "./contract.js";
import { GhostBrowserProvider } from "./browser.js";
import { GhostBridgeProvider } from "./bridge.js";
import { createAllLayerProviders } from "./provider.js";
import { AutonomousGhostProvider } from "./autonomous/autonomous-provider.js";
import { GhostBrainAiEngine } from "./autonomous/ghostbrain-engine.js";
import { GhostGasEngine } from "./gas.js";
import { parseGhost, formatGhost, parseGhostGwei, formatGhostGwei } from "./units.js";
import { Interface, AbiCoder, Contract, ContractFactory, getAddress, isAddress, isHexString, keccak256, solidityPacked, solidityPackedKeccak256, toUtf8Bytes, formatEther, parseEther, formatUnits, parseUnits, id, hexlify, concat } from "ethers";
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
export declare const ghost: {
    /** Layer-aware JSON-RPC provider. Extends ghost.JsonRpcProvider. */
    readonly JsonRpcProvider: typeof ghostJsonRpcProvider;
    /** EIP-1193 browser provider (GhostWallet-compatible). */
    readonly BrowserProvider: typeof GhostBrowserProvider;
    /** Multi-layer bridge provider (L1 + L2 + L3 in one object). */
    readonly BridgeProvider: typeof GhostBridgeProvider;
    /** Layer-aware HD/private-key wallet. Extends ghost.Wallet. */
    readonly Wallet: typeof GhostWallet;
    /** Attach to a deployed contract address with layer metadata. */
    readonly contractAt: typeof ghostContractAt;
    /** Connect a GhostContract to a new runner, preserving layer. */
    readonly connectContract: typeof connectGhostContract;
    /** Pre-configured L1 / L2 / L3 network definitions. */
    readonly Networks: Record<import("./networks.js").GhostLayer, import("./networks.js").GhostNetworkConfig>;
    /** Create one provider per layer in a single call. */
    readonly createAllLayerProviders: typeof createAllLayerProviders;
    /** AI-powered routing + circuit-breaker provider (all layers). */
    readonly AutonomousProvider: typeof AutonomousGhostProvider;
    /** Remote AI engine backed by GhostBrain Core (with local fallback). */
    readonly GhostBrainEngine: typeof GhostBrainAiEngine;
    /** GST gas fee oracle for any layer provider. */
    readonly GasEngine: typeof GhostGasEngine;
    /** Ghost unit system — parseGhost / formatGhost / GhostWei etc. */
    readonly units: {
        readonly GHOST_WEI: 1n;
        readonly GHOST_GWEI: 1000000000n;
        readonly GHOST_UNIT: 1000000000000000000n;
        readonly parseGhost: typeof parseGhost;
        readonly formatGhost: typeof formatGhost;
        readonly parseGhostGwei: typeof parseGhostGwei;
        readonly formatGhostGwei: typeof formatGhostGwei;
    };
    readonly parseGhost: typeof parseGhost;
    readonly formatGhost: typeof formatGhost;
    readonly parseGhostGwei: typeof parseGhostGwei;
    readonly formatGhostGwei: typeof formatGhostGwei;
    readonly Contract: typeof Contract;
    readonly ContractFactory: typeof ContractFactory;
    readonly Interface: typeof Interface;
    readonly AbiCoder: typeof AbiCoder;
    readonly ZeroAddress: string;
    readonly ZeroHash: string;
    readonly MaxUint256: bigint;
    readonly getAddress: typeof getAddress;
    readonly isAddress: typeof isAddress;
    readonly isHexString: typeof isHexString;
    readonly keccak256: typeof keccak256;
    readonly solidityPacked: typeof solidityPacked;
    readonly solidityPackedKeccak256: typeof solidityPackedKeccak256;
    readonly toUtf8Bytes: typeof toUtf8Bytes;
    readonly formatEther: typeof formatEther;
    readonly parseEther: typeof parseEther;
    readonly formatUnits: typeof formatUnits;
    readonly parseUnits: typeof parseUnits;
    readonly id: typeof id;
    readonly hexlify: typeof hexlify;
    readonly concat: typeof concat;
};
export default ghost;
//# sourceMappingURL=index.d.ts.map

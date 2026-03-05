/**
 * @ghostchain/sdk
 *
 * GhostChain Sovereign SDK — Ghost-native primitives with a zero-ethers
 * native layer and full L1 / L2 / L3 routing.
 *
 * Primary import (namespace style):
 *   import { ghost } from "@ghostchain/sdk";
 *
 *   const provider = new ghost.JsonRpcProvider("http://...", "L2");
 *   const wallet   = new ghost.Wallet(privateKey, provider);
 *   const contract = new ghost.Contract(address, abi, wallet);
 *
 * Native (zero-ethers) import:
 *   import { GhostNetworkRegistry, GhostSecurity, GhostEvents } from "@ghostchain/sdk";
 *
 * All primitives are re-exported as named exports for tree-shaking.
 */

// ── ghost re-exports ───────────────────────────────────────────────────────
// Re-export common ghost/ethers primitives so callers can use them
// directly from "@ghostl/ghost-sdk" without a separate import.
export {
  Wallet,
  Contract,
  ContractFactory,
  Interface,
  AbiCoder,
  Network,
  ZeroAddress,
  ZeroHash,
  MaxUint256,
  getAddress,
  isAddress,
  keccak256,
  solidityPacked,
  solidityPackedKeccak256,
  toUtf8Bytes,
  formatUnits,
  parseUnits,
  formatEther,
  parseEther,
  hexlify,
  isHexString,
  id,
  concat,
  decodeRlp,
  encodeRlp,
  type Signer,
  type Provider,
  type ContractRunner,
  type BigNumberish,
  type BytesLike,
  type InterfaceAbi,
  type TransactionResponse,
  type TransactionReceipt,
  type Block,
  type Log,
} from "ethers";

// ── Ghost-native exports ─────────────────────────────────────────────────────
export {
  ghostJsonRpcProvider as JsonRpcProvider,
  createL1Provider,
  createL2Provider,
  createL3Provider,
  createAllLayerProviders,
} from "./provider.js";

export {
  GhostWallet,
  ghostWalletFromMnemonic,
  createRandomGhostWallet,
} from "./wallet.js";

export {
  GhostContract,
  ghostContractAt,
  connectGhostContract,
  // plain ghost Contract re-export
  Contract as ghostContract,
} from "./contract.js";

export { GhostBrowserProvider } from "./browser.js";

export {
  GhostBridgeProvider,
  type BridgeProviderUrls,
  type LayerRouteInfo,
} from "./bridge.js";

export {
  GhostNetworks,
  networkByChainId,
  parentLayer,
  DERIVATION_PATH,
  type GhostLayer,
  type GhostNetworkConfig,
} from "./networks.js";

// ── Autonomous routing layer ─────────────────────────────────────────────────
export {
  GhostRoutingError,
  GhostRpcUnavailableError,
  GhostQuorumError,
} from "./errors.js";

export {
  HeuristicAiEngine,
  type GhostAiEngine,
  type RpcHealth,
  type RouteIntent,
  type AiDecision,
} from "./autonomous/ai-engine.js";

export { RpcPool } from "./autonomous/rpc-pool.js";

export {
  AutonomousGhostProvider,
  type AutonomousConfig,
} from "./autonomous/autonomous-provider.js";

export {
  GhostBrainAiEngine,
  type GhostBrainEngineConfig,
} from "./autonomous/ghostbrain-engine.js";

// ── Ghost unit system ─────────────────────────────────────────────────────────
export {
  GhostUnits,
  parseGhost,
  formatGhost,
  parseGhostGwei,
  formatGhostGwei,
  GHOST_WEI,
  GHOST_GWEI,
  GHOST_UNIT,
} from "./units.js";

// ── Ghost gas engine ──────────────────────────────────────────────────────────
export {
  GhostGasEngine,
  type GhostFeeData,
  type GhostGasEstimate,
} from "./gas.js";

// ── `ghost` namespace (primary branded API) ──────────────────────────────────
import { ghostJsonRpcProvider } from "./provider.js";
import { GhostWallet } from "./wallet.js";
import { ghostContractAt, connectGhostContract } from "./contract.js";
import { GhostBrowserProvider } from "./browser.js";
import { GhostBridgeProvider } from "./bridge.js";
import { GhostNetworks } from "./networks.js";
import { createAllLayerProviders } from "./provider.js";
import { AutonomousGhostProvider } from "./autonomous/autonomous-provider.js";
import { GhostBrainAiEngine }      from "./autonomous/ghostbrain-engine.js";
import { GhostGasEngine }           from "./gas.js";
import {
  GhostUnits,
  parseGhost,
  formatGhost,
  parseGhostGwei,
  formatGhostGwei,
} from "./units.js";
import {
  Interface,
  AbiCoder,
  Contract,
  ContractFactory,
  ZeroAddress,
  ZeroHash,
  MaxUint256,
  getAddress,
  isAddress,
  isHexString,
  keccak256,
  solidityPacked,
  solidityPackedKeccak256,
  toUtf8Bytes,
  formatEther,
  parseEther,
  formatUnits,
  parseUnits,
  id,
  hexlify,
  concat,
} from "ethers";

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
export const ghost = {
  // ── Providers ──────────────────────────────────────────
  /** Layer-aware JSON-RPC provider. Extends ghost.JsonRpcProvider. */
  JsonRpcProvider: ghostJsonRpcProvider,
  /** EIP-1193 / MetaMask browser provider. */
  BrowserProvider: GhostBrowserProvider,
  /** Multi-layer bridge provider (L1 + L2 + L3 in one object). */
  BridgeProvider: GhostBridgeProvider,

  // ── Signers ────────────────────────────────────────────
  /** Layer-aware HD/private-key wallet. Extends ghost.Wallet. */
  Wallet: GhostWallet,

  // ── Contract ───────────────────────────────────────────
  /** Attach to a deployed contract address with layer metadata. */
  contractAt: ghostContractAt,
  /** Connect a GhostContract to a new runner, preserving layer. */
  connectContract: connectGhostContract,

  // ── Network config & utils ────────────────────────────
  /** Pre-configured L1 / L2 / L3 network definitions. */
  Networks: GhostNetworks,
  /** Create one provider per layer in a single call. */
  createAllLayerProviders,
  /** AI-powered routing + circuit-breaker provider (all layers). */
  AutonomousProvider: AutonomousGhostProvider,
  /** Remote AI engine backed by GhostBrain Core (with local fallback). */
  GhostBrainEngine: GhostBrainAiEngine,
  /** GST gas fee oracle for any layer provider. */
  GasEngine: GhostGasEngine,

  // ── Ghost unit utilities ──────────────────────────────────────────────
  /** Ghost unit system — parseGhost / formatGhost / GhostWei etc. */
  units: GhostUnits,
  parseGhost,
  formatGhost,
  parseGhostGwei,
  formatGhostGwei,

  // ── ghost utilities (convenience re-exports) ─────────
  Contract,
  ContractFactory,
  Interface,
  AbiCoder,
  ZeroAddress,
  ZeroHash,
  MaxUint256,
  getAddress,
  isAddress,
  isHexString,
  keccak256,
  solidityPacked,
  solidityPackedKeccak256,
  toUtf8Bytes,
  formatEther,
  parseEther,
  formatUnits,
  parseUnits,
  id,
  hexlify,
  concat,
} as const;

// Default export for `import ghost from "@ghostl/ghost-sdk"` style.
export default ghost;

// ── Native (zero-ethers-dependency) Ghost layer ───────────────────────────────
// Classes built from scratch using @noble/curves + @noble/hashes.
// Use these when you need a pure Ghost SDK with no ethers.js at all.
export {
  GhostNativeProvider,
  GhostNativeWallet,
  GhostNativeContract,
  GhostNativeERC20,
  GhostNativeInterface,
  GhostNativeGasEngine,
  GhostNativeUnits,
  GhostTransaction,
  GhostJsonRpc,
  GhostCircuitBreaker,
  receiptStatusOk,
  receiptGasUsed,
  receiptBlockNumber,
  keccak256Bytes,
  keccak256Hex,
  keccak256Utf8,
  isAddress as isGhostAddress,
  normalizeAddress,
  toChecksumAddress,
  functionSelector,
  encodeCall,
  decodeUint256 as decodeGhostUint256,
  decodeAddress as decodeGhostAddress,
  rlpEncode,
  withRetry,
  createGhostNativeLogger,
  safeJsonStringify,
  redact,
  nowMs,
  sleep,
} from "./native/index.js";

// ── Ghost-sovereign modules (no ethers dependency) ───────────────────────────

export {
  GhostNetworkRegistry,
  ghostNetworkRegistry,
} from "./core/GhostNetworkRegistry.js";

export {
  GhostSecurity,
  GhostSecurityError,
} from "./security/GhostSecurity.js";

export {
  GhostEvents,
  GhostTypedEvents,
  ghostEvents,
  type GhostEventListener,
  type GhostEventSubscription,
  type GhostSystemEvent,
} from "./events/GhostEvents.js";

// ── Ghost SDK Ultimate — AI, Routing, Bridge, GNS, Validator ─────────────────

export {
  GhostAIGasOptimizer,
  type NetworkStats,
  type GasOptimisationResult,
  type GasOptimizerConfig,
} from "./ai/GhostAIGasOptimizer.js";

export {
  GhostAITransactionPlanner,
  type TxIntent,
  type LayerLoad,
  type TxPlan,
  type TransactionPlannerConfig,
} from "./ai/GhostAITransactionPlanner.js";

export {
  GhostAIBridgePredictor,
  type BridgeDirection,
  type BridgeLoad,
  type BridgeForecast,
} from "./ai/GhostAIBridgePredictor.js";

export {
  GhostCrossChainRouter,
  ghostCrossChainRouter,
  type RouteResult,
  type BridgeHop,
} from "./routing/GhostCrossChainRouter.js";

export {
  GhostLayerResolver,
  ghostLayerResolver,
  type LayerResolution,
} from "./routing/GhostLayerResolver.js";

export {
  GhostFinalityTracker,
  type FinalityStatus,
  type FinalityConfig,
} from "./bridge/GhostFinalityTracker.js";

export {
  GhostBridgeWatcher,
  type BridgeWatchResult,
  type BridgeWatchConfig,
} from "./bridge/GhostBridgeWatcher.js";

export { GNSCache, type GNSCacheEntry, type GNSCacheConfig } from "./gns/GNSCache.js";

export {
  GNSResolver,
  gnsResolver,
  gnsNamehash,
  type GNSResolverConfig,
} from "./gns/GNSResolver.js";

export {
  GhostRPCMonitor,
  type RpcHealthResult,
  type RpcMonitorConfig,
} from "./validator/GhostRPCMonitor.js";

export {
  GhostValidatorMonitor,
  type ValidatorHealth,
  type ValidatorMonitorConfig,
} from "./validator/GhostValidatorMonitor.js";

export {
  GhostBrainClient,
  type GhostBrainClientConfig,
  type BrainTelemetry,
  type GasAdviceRequest,
  type GasAdviceResponse,
  type BrainRpcDecision,
} from "./ghostbrain/GhostBrainClient.js";

export {
  GhostBrainTelemetry,
  type GasMetric,
  type ValidatorMetric,
  type BridgeMetric,
  type GhostBrainTelemetryConfig,
} from "./ghostbrain/GhostBrainTelemetry.js";

export {
  GhostEventSubscriber,
  type GhostBlockEvent,
  type GhostLogEvent,
  type GhostLogFilter,
  type GhostEventSubscriberConfig,
} from "./events/GhostEventSubscriber.js";

export {
  GhostWalletAdapter,
  type WalletAdapterConfig,
  type WalletAdapterState,
  type WalletAdapterInfo,
  type WalletAdapterListener,
} from "./next/GhostWalletAdapter.js";

export {
  GhostWalletState,
  createGhostWalletState,
  type GhostWalletSnapshot,
  type GhostWalletSubscriber,
} from "./next/useGhostWallet.js";

export { GhostKeyStore, type KeyStoreEntry, type KeyStoreJSON } from "./wallet/GhostKeyStore.js";

export {
  GhostSoftwareHardwareWallet,
  GhostHardwareWalletBase,
  type GhostHardwareWallet,
  type Eip712Domain,
  type Eip712Type,
  type SignatureComponents as HardwareWalletSignatureComponents,
} from "./wallet/GhostHardwareWallet.js";

export {
  GhostAbiEncoder,
  ghostAbiEncoder,
  type AbiParam,
  type AbiParamType,
} from "./contract/GhostAbiEncoder.js";

export {
  GhostAbiDecoder,
  ghostAbiDecoder,
  type AbiOutputType,
  type DecodedValue,
} from "./contract/GhostAbiDecoder.js";

export { GhostTxBuilder } from "./transaction/GhostTxBuilder.js";

export {
  GhostGasOracle,
  type GhostGasOracleConfig,
} from "./transaction/GhostGasOracle.js";

export {
  GhostNetworkDetector,
  ghostNetworkDetector,
  type DetectionResult,
  type GhostNetworkDetectorConfig,
} from "./core/GhostNetworkDetector.js";

export {
  GhostHealthMonitor,
  type LayerHealth,
  type StackHealthReport,
  type GhostHealthMonitorConfig,
} from "./core/GhostHealthMonitor.js";

export {
  GhostSignatureValidator,
  ghostSignatureValidator,
  type SignatureComponents,
} from "./security/GhostSignatureValidator.js";

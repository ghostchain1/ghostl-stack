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
  type TransactionRequest,
  type ContractTransactionResponse,
  type FeeData,
  type BaseContract,
  type Block,
  type Log,
  HDNodeWallet,
  zeroPadValue,
  verifyMessage,
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
  GhostNativeProvider,
  GhostNativeWallet,
  GhostNativeContract,
  GhostNativeGasEngine,
  GhostTransaction,
  GhostJsonRpc,
} from "./native/index.js";
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
  /** Zero-ethers native provider — direct JSON-RPC transport. */
  Provider: GhostNativeProvider,
  /** EIP-1193 / GhostWallet browser provider. */
  BrowserProvider: GhostBrowserProvider,
  /** Multi-layer bridge provider (L1 + L2 + L3 in one object). */
  BridgeProvider: GhostBridgeProvider,

  // ── Signers ────────────────────────────────────────────
  /** Layer-aware HD/private-key wallet (ethers-backed). */
  Wallet: GhostWallet,
  /** Zero-ethers native wallet — secp256k1 + EIP-1559 signing. */
  NativeWallet: GhostNativeWallet,

  // ── Contract ───────────────────────────────────────────
  /** Attach to a deployed contract address with layer metadata. */
  contractAt: ghostContractAt,
  /** Connect a GhostContract to a new runner, preserving layer. */
  connectContract: connectGhostContract,
  /** Zero-ethers native contract — ABI encoding + eth_call. */
  NativeContract: GhostNativeContract,

  // ── Transactions ───────────────────────────────────────
  /** EIP-1559 transaction builder (zero-ethers). */
  Transaction: GhostTransaction,
  /** Low-level JSON-RPC transport. */
  JsonRpc: GhostJsonRpc,

  // ── Network config & utils ────────────────────────────
  /** Pre-configured L1 / L2 / L3 network definitions. */
  Networks: GhostNetworks,
  /** Create one provider per layer in a single call. */
  createAllLayerProviders,
  /** AI-powered routing + circuit-breaker provider (all layers). */
  AutonomousProvider: AutonomousGhostProvider,
  /** Remote AI engine backed by GhostBrain Core (with local fallback). */
  GhostBrainEngine: GhostBrainAiEngine,
  /** GST gas fee oracle for any layer provider (ethers-backed). */
  GasEngine: GhostGasEngine,
  /** GST gas fee oracle — zero-ethers native implementation. */
  NativeGasEngine: GhostNativeGasEngine,

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
// Use these when you need a pure Ghost SDK with no ghost-sdk at all.
//
// Simple aliases (no "Native" prefix) for the primary ghost classes:
//   GhostProvider   = GhostNativeProvider  (JSON-RPC transport)
//   GhostTx         = GhostTransaction     (EIP-1559 builder)
//   GhostRpc        = GhostJsonRpc         (low-level RPC)
//   GhostNativeWallet / GhostNativeContract / GhostNativeGasEngine
//   are exported as-is to avoid conflict with the ethers-backed variants.
export {
  GhostNativeProvider,
  GhostNativeProvider as GhostProvider,
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
  type BridgeWatcherConfig,
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

// ── Ghost SDK v2 — Native SDK (no ethers) ─────────────────────────────────────

// Providers
export { HttpProvider, type HttpProviderBlock, type HttpProviderTx } from "./providers/HttpProvider.js";
export { GhostWebSocketProvider, type WsNewHeadEvent, type WsLogEvent } from "./providers/WebSocketProvider.js";

// Wallet
export { GhostSigner, type Eip712Domain as GhostEip712Domain, type Eip712Type as GhostEip712Type } from "./wallet/GhostSigner.js";
export { GhostAccount } from "./wallet/GhostAccount.js";
export { GhostHDWallet, type GhostHDAccount, generateMnemonic, GHOST_HD_PATH } from "./wallet/GhostHDWallet.js";

// Transactions
export { GhostTransactionSerializer, type SerializedTx } from "./transactions/GhostTransactionSerializer.js";
export { GhostFeeEstimator, type GhostFeeEstimate, type GhostFeeEstimatorOptions } from "./transactions/GhostFeeEstimator.js";

// Contracts
export { GhostContractFactory, type AbiFragment as GhostAbiFragment, type DeployResult } from "./contracts/GhostContractFactory.js";
export { GhostInterface } from "./contracts/GhostInterface.js";
export { GhostEventParser, type ParsedEvent } from "./contracts/GhostEventParser.js";
export { GhostLogDecoder, type DecodedLog } from "./contracts/GhostLogDecoder.js";

// Clients
export { GhostPublicClient, type GhostPublicClientConfig } from "./clients/GhostPublicClient.js";
export { GhostWalletClient, type GhostWalletClientConfig } from "./clients/GhostWalletClient.js";
export { GhostContractClient, type GhostContractClientConfig } from "./clients/GhostContractClient.js";

// Bridge — L1 / L2 / L3 clients
export { L1Client, GHOST_L1_CHAIN_ID, GHOST_L1_NAME } from "./bridge/L1Client.js";
export { L2Client, GHOST_L2_CHAIN_ID, GHOST_L2_NAME } from "./bridge/L2Client.js";
export { L3Client, GHOST_L3_CHAIN_ID, GHOST_L3_NAME } from "./bridge/L3Client.js";
export { GhostBridgeClient, type BridgeConfig, type BridgeStatus } from "./bridge/GhostBridgeClient.js";

// Multicall
export { MulticallClient, MULTICALL3_ADDRESS, type MulticallCall, type MulticallResult } from "./multicall/MulticallClient.js";

// Account Abstraction (ERC-4337)
export { SmartAccount, ENTRY_POINT_V06, ENTRY_POINT_V07, type UserOperation } from "./accounts/SmartAccount.js";
export { AccountAbstraction, type UserOperationReceipt, type GasEstimate as BundlerGasEstimate } from "./accounts/AccountAbstraction.js";

// Event watchers
export { BlockWatcher, type BlockCallback } from "./events/BlockWatcher.js";
export { LogWatcher, type LogFilter, type LogCallback, type RawLog as WatchedLog } from "./events/LogWatcher.js";

// Core
export { GhostClient, type GhostClientConfig } from "./core/GhostClient.js";

// Explorer
export { GhostExplorerClient, type ExplorerConfig, type ExplorerTransaction, type ExplorerBlock } from "./explorer/GhostExplorerClient.js";

// AI
export { TransactionOptimizer, type TxOptimizationResult, type TxOptimizationRequest } from "./ai/TransactionOptimizer.js";

// ── Ghost SDK v3 — Missing Production Modules ─────────────────────────────────

// Block Number
export {
  GhostBlockNumber,
  GhostBlockNumberWatcher,
  GhostMultiLayerBlockTracker,
  getGhostBlockNumber,
  GHOST_GENESIS_BLOCK,
  GHOST_BLOCK_SENTINEL,
  type GhostBlockSentinel,
  type GhostBlockNumberCallback,
  type GhostLayerBlockNumbers,
} from "./blockNumber/GhostBlockNumber.js";

// Hash utilities
export {
  keccak256Raw,
  sha256,
  sha256Hex,
  sha512,
  solidityKeccak256,
  eventTopic,
  GHOST_EMPTY_HASH,
  GHOST_ZERO_HASH,
  GHOST_TOPICS,
  type GhostHash,
} from "./hash/GhostHash.js";

// Address utilities
export {
  GHOST_ZERO_ADDRESS,
  GHOST_DEAD_ADDRESS,
  GHOST_MAX_ADDRESS,
  isZeroAddress,
  addressEqual,
  addressToWord,
  wordToAddress,
  getCreateAddress,
  getCreate2Address,
  shortenAddress,
  addressToLower,
} from "./address/GhostAddress.js";

// ABI utilities
export {
  abiSignature,
  fragmentSelector,
  decodeReturnData,
  decodeUint256,
  decodeAddress,
  decodeBool,
  decodeString,
  encodeBalanceOf,
  encodeTransfer,
  encodeApprove,
  encodeAllowance,
  encodeTotalSupply,
  encodeDecimals,
  encodeSymbol,
  encodeName,
  type AbiFragment,
  type AbiFunctionFragment,
  type AbiEventFragment,
  type AbiInput,
  type AbiOutput,
} from "./abi/GhostAbi.js";

// Signature utilities
export {
  personalSignHash,
  hashMessage,
  splitSignature,
  joinSignature,
  recoverAddress,
  recoverPersonalSignAddress,
  verifySignature,
  verifyPersonalSign,
  compactToFull,
  fullToCompact,
  type GhostSignatureComponents,
} from "./signature/GhostSignature.js";

// Gas tracker
export {
  GhostGasTracker,
  formatWei,
  formatGwei,
  parseGwei,
  type GhostGasSnapshot,
  type GhostGasEstimate as GhostGasTrackerEstimate,
  type GhostGasHistoryEntry,
  type GhostSpeedPreset,
  type GhostGasTrackerConfig,
} from "./gas/GhostGasTracker.js";

// Nonce management
export {
  GhostNonceManager,
  BoundNonceManager,
  type GhostNonceManagerOptions,
} from "./nonce/GhostNonceManager.js";

// RPC client
export {
  GhostRpcClient,
  GhostRpcError,
  createGhostL1RpcClient,
  createGhostL2RpcClient,
  createGhostL3RpcClient,
  type GhostRpcClientConfig,
  type GhostBatchCall,
} from "./rpc/GhostRpcClient.js";

// Token clients
export {
  GhostERC20,
  type GhostERC20Info,
  type GhostERC20TransferEvent,
  type GhostERC20Config,
} from "./token/GhostERC20.js";

export {
  GhostERC721,
  type GhostERC721Info,
  type GhostERC721TransferEvent,
} from "./token/GhostERC721.js";

export {
  GhostERC1155,
  type GhostERC1155TransferSingleEvent,
  type GhostERC1155TransferBatchEvent,
} from "./token/GhostERC1155.js";

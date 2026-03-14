/**
 * @ghostchain/sdk — central types barrel.
 *
 * Re-exports every public type from the SDK so users can import
 * from a single path: `import type { ... } from "@ghostchain/sdk/types"`.
 */

// ── Native primitive types ────────────────────────────────────────────────────
export type {
  Hex,
  GhostAddress,
  GhostChainId,
  GhostRpcRequest,
  GhostRpcResponse,
  GhostBlockTag,
  GhostFeeSuggestion,
  GhostTxRequest,
  GhostTxReceipt,
  GhostCallRequest,
  GhostLogFilter,
  GhostProviderOptions,
  GhostWalletOptions,
} from "../native/types.js";

// ── Provider types ────────────────────────────────────────────────────────────
export type {
  HttpProviderBlock,
  HttpProviderTx,
} from "../providers/HttpProvider.js";

export type {
  WsNewHeadEvent,
  WsLogEvent,
} from "../providers/WebSocketProvider.js";

// ── Wallet types ──────────────────────────────────────────────────────────────
export type {
  GhostHDAccount,
} from "../wallet/GhostHDWallet.js";

export type {
  Eip712Domain as GhostEip712Domain,
  Eip712Type as GhostEip712Type,
} from "../wallet/GhostSigner.js";

// ── Transaction types ─────────────────────────────────────────────────────────
export type {
  SerializedTx,
} from "../transactions/GhostTransactionSerializer.js";

export type {
  GhostFeeEstimate,
  GhostFeeEstimatorOptions,
} from "../transactions/GhostFeeEstimator.js";

// ── Client types ──────────────────────────────────────────────────────────────
export type {
  GhostPublicClientConfig,
} from "../clients/GhostPublicClient.js";

export type {
  GhostWalletClientConfig,
} from "../clients/GhostWalletClient.js";

export type {
  GhostContractClientConfig,
} from "../clients/GhostContractClient.js";

// ── Bridge types ──────────────────────────────────────────────────────────────
export type {
  BridgeConfig,
  BridgeStatus,
} from "../bridge/GhostBridgeClient.js";

// ── Multicall types ───────────────────────────────────────────────────────────
export type {
  MulticallCall,
  MulticallResult,
} from "../multicall/MulticallClient.js";

// ── Account abstraction types ─────────────────────────────────────────────────
export type {
  UserOperation,
} from "../accounts/SmartAccount.js";

export type {
  UserOperationReceipt,
  GasEstimate as BundlerGasEstimate,
} from "../accounts/AccountAbstraction.js";

// ── Event watcher types ───────────────────────────────────────────────────────
export type {
  BlockCallback,
} from "../events/BlockWatcher.js";

export type {
  LogFilter,
  LogCallback,
  RawLog as WatchedRawLog,
} from "../events/LogWatcher.js";

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  GhostClientConfig,
} from "../core/GhostClient.js";

export type {
  DetectionResult,
  GhostNetworkDetectorConfig,
} from "../core/GhostNetworkDetector.js";

export type {
  LayerHealth,
  StackHealthReport,
  GhostHealthMonitorConfig,
} from "../core/GhostHealthMonitor.js";

// ── Explorer types ────────────────────────────────────────────────────────────
export type {
  ExplorerConfig,
  ExplorerTransaction,
  ExplorerBlock,
} from "../explorer/GhostExplorerClient.js";

// ── AI types ──────────────────────────────────────────────────────────────────
export type {
  TxOptimizationResult,
  TxOptimizationRequest,
} from "../ai/TransactionOptimizer.js";

// ── ABI types ─────────────────────────────────────────────────────────────────
export type {
  AbiFragment,
  AbiFunctionFragment,
  AbiEventFragment,
  AbiInput,
  AbiOutput,
  AbiParamType,
} from "../abi/GhostAbi.js";

// ── Signature types ───────────────────────────────────────────────────────────
export type {
  GhostSignatureComponents,
} from "../signature/GhostSignature.js";

// ── Gas types ─────────────────────────────────────────────────────────────────
export type {
  GhostGasSnapshot,
  GhostGasEstimate,
  GhostGasHistoryEntry,
  GhostSpeedPreset,
  GhostGasTrackerConfig,
} from "../gas/GhostGasTracker.js";

// ── Nonce types ───────────────────────────────────────────────────────────────
export type {
  GhostNonceManagerOptions,
} from "../nonce/GhostNonceManager.js";

// ── RPC types ─────────────────────────────────────────────────────────────────
export type {
  GhostRpcClientConfig,
  GhostBatchCall,
} from "../rpc/GhostRpcClient.js";

// ── BlockNumber types ─────────────────────────────────────────────────────────
export type {
  GhostBlockSentinel,
  GhostBlockNumberCallback,
  GhostLayerBlockNumbers,
} from "../blockNumber/GhostBlockNumber.js";

// ── Token types ───────────────────────────────────────────────────────────────
export type {
  GhostERC20Info,
  GhostERC20TransferEvent,
  GhostERC20Config,
} from "../token/GhostERC20.js";

export type {
  GhostERC721Info,
  GhostERC721TransferEvent,
} from "../token/GhostERC721.js";

export type {
  GhostERC1155TransferSingleEvent,
  GhostERC1155TransferBatchEvent,
} from "../token/GhostERC1155.js";

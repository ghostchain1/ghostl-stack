// configuration & errors
export * from "./config.js";
export * from "./errors.js";

// AI layer
export * from "./ai/TaskTypes.js";
export * from "./ai/GhostBrainWS.js";
export * from "./ai/SwarmCoordinator.js";

// chain layer — GhostLayer re-exported via chain/Types.ts which defers to config.ts
export type { TxRequest, RoutedTxPlan, TxRouteDecision } from "./chain/Types.js";
export * from "./chain/GhostJsonRpcProvider.js";
export * from "./chain/LayerRouter.js";
export * from "./chain/TxBuilder.js";

// audit layer
export * from "./audit/Types.js";
export * from "./audit/ContractAuditor.js";

// risk layer
export * from "./risk/GhostRisk.js";

// monitor layer
export * from "./monitor/Types.js";
export * from "./monitor/ValidatorMonitor.js";

// utilities
export * from "./utils/backoff.js";
export * from "./utils/safeJson.js";
export * from "./utils/address.js";

// ── ghost namespace ──────────────────────────────────────────────────────────
//
// Usage:  import { ghost } from "@ghost/ai-sdk"
//         const provider = new ghost.JsonRpcProvider({ layer: "L2", rpc: "..." })

import { GhostJsonRpcProvider } from "./chain/GhostJsonRpcProvider.js";
import { GhostRisk }            from "./risk/GhostRisk.js";

export const ghost = {
  /** AI-aware, layer-aware ethers v6 provider for GhostStack. */
  JsonRpcProvider: GhostJsonRpcProvider,
  /** Composite transaction risk assessment engine. */
  Risk:            GhostRisk,
} as const;

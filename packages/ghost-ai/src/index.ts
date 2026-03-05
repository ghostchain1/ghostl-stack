/**
 * @ghost/ai
 *
 * AI-native GhostChain developer SDK with GhostBrain integration.
 *
 * ```ts
 * import Ghost from "@ghost/ai";
 *
 * const ghost = new Ghost({ name: "GhostTxAI", brainEndpoint: "http://ghostbrain-core:7900" });
 *
 * const result = await ghost.think("analyze_transaction", {
 *   to:    getAddress(tx.to),
 *   value: formatEther(tx.value),
 *   hash:  tx.hash,
 * });
 *
 * if (result.risk === "high") throw new Error("Ghost AI blocked unsafe transaction");
 * ```
 *
 * ## Well-known tasks
 * | Task                    | Purpose                              |
 * | ----------------------- | ------------------------------------ |
 * | `analyze_transaction`   | fraud / anomaly detection            |
 * | `optimize_gas`          | AI gas-fee recommendation            |
 * | `inspect_contract_call` | calldata security review             |
 * | `validate_abi_payload`  | ABI-encoded payload verification     |
 * | `contract_guardian`     | runtime contract interaction guard   |
 * | `system_health_check`   | infra / chain health probe           |
 * | `analyze_event`         | decoded log event analysis           |
 */

export { Ghost, Ghost as default } from "./Ghost.js";
export type {
  GhostConfig,
  GhostEvents,
  GhostTask,
  GhostRisk,
  ThinkRequest,
  ThinkResponse,
} from "./types.js";

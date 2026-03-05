/**
 * @ghost/ai — shared types
 */

// ── Well-known task identifiers ───────────────────────────────────────────────

export type GhostTask =
  | "analyze_transaction"   // fraud / anomaly detection on a raw tx
  | "optimize_gas"          // AI gas-fee recommendation
  | "inspect_contract_call" // calldata security review
  | "validate_abi_payload"  // ABI-encoded payload verification
  | "contract_guardian"     // runtime contract interaction guard
  | "system_health_check"   // infra / chain health probe
  | "analyze_event"         // decoded log event analysis
  | (string & {}); // allow custom tasks without losing autocomplete on the above

// ── Risk levels ───────────────────────────────────────────────────────────────

export type GhostRisk = "low" | "medium" | "high" | "critical";

// ── Think request / response ──────────────────────────────────────────────────

export interface ThinkRequest {
  task:    GhostTask;
  payload: Record<string, unknown>;
  agent:   string; // caller name
}

export interface ThinkResponse {
  task:            GhostTask;
  agent:           string;
  ok:              boolean;
  result:          unknown;
  risk?:           GhostRisk;
  recommendation?: string;
  latencyMs:       number;
  ts:              string;
}

// ── Ghost constructor config ──────────────────────────────────────────────────

export interface GhostConfig {
  /**
   * Agent identifier — used in GhostBrain logs and event payloads.
   * @default "GhostAgent"
   */
  name?: string;
  /**
   * GhostBrain Core base URL.
   * @default env GHOSTBRAIN_CORE_URL or "http://localhost:7900"
   */
  brainEndpoint?: string;
  /**
   * HMAC secret for signing outbound requests.
   * @default env CONTROL_PLANE_HMAC_SECRET
   */
  hmacSecret?: string;
  /**
   * Request timeout in ms before the call is rejected.
   * @default 5000
   */
  timeoutMs?: number;
}

// ── Ghost events ──────────────────────────────────────────────────────────────

export interface GhostEvents {
  /** Emitted when Ghost AI flags a high/critical risk result. */
  alert:    [response: ThinkResponse];
  /** Emitted on every successful think() call. */
  decision: [response: ThinkResponse];
  /** Emitted on network/parse errors. */
  error:    [err: Error];
}

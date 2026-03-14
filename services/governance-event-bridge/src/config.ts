/**
 * config.ts
 *
 * Configuration for the Governance Event Bridge.
 * All values are read from environment variables with sensible defaults
 * for local development.
 */

export const config = {
  /** Ethereum-compatible JSON-RPC endpoint for GhostChain L1 */
  rpcUrl: process.env["GHOSTCHAIN_RPC_URL"] ?? "http://localhost:8545",

  /** Chain ID for GhostChain L1 */
  chainId: parseInt(process.env["GHOSTCHAIN_CHAIN_ID"] ?? "1337", 10),

  /** Address of the on-chain Governance contract to watch */
  governanceContractAddress: process.env["GOVERNANCE_CONTRACT_ADDRESS"] ?? "0x0000000000000000000000000000000000000000",

  /** Block number to start indexing from (0 = live head only) */
  startBlock: parseInt(process.env["START_BLOCK"] ?? "0", 10),

  /** How often to poll for new events (ms) */
  pollIntervalMs: parseInt(process.env["POLL_INTERVAL_MS"] ?? "12000", 10),

  /** Base URL of the ghostbrain-core service */
  ghostbrainCoreUrl: process.env["GHOSTBRAIN_CORE_URL"] ?? "http://ghostbrain-core:9100",

  /** HTTP timeout (ms) for calls to ghostbrain-core */
  ghostbrainTimeoutMs: parseInt(process.env["GHOSTBRAIN_TIMEOUT_MS"] ?? "5000", 10),

  /** Service HTTP port (for /health) */
  port: parseInt(process.env["PORT"] ?? "9200", 10),

  /** Log level */
  logLevel: process.env["LOG_LEVEL"] ?? "info",
} as const;

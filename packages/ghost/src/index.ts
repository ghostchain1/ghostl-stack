/**
 * ghost
 *
 * GhostChain SDK — the full @ghostl/ghost-sdk surface exported under
 * the bare `ghost` specifier.
 *
 * Usage:
 *
 *   // Namespace default import
 *   import ghost from "ghost";
 *   const provider = new ghost.JsonRpcProvider("http://localhost:29547", "L2");
 *
 *   // Named imports
 *   import { ghost, JsonRpcProvider, GhostWallet } from "ghost";
 *
 *   // CommonJS
 *   const ghost = require("ghost").default;
 *   const { ghost: ns } = require("ghost");
 */

// Re-export the entire @ghostchain/sdk surface as named exports.
export * from "@ghostchain/sdk";

// Re-export the branded `ghost` namespace as the default export
// so that `import ghost from "ghost"` works.
export { ghost as default } from "@ghostchain/sdk";

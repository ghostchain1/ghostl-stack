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
export * from "@ghostl/ghost-sdk";
export { ghost as default } from "@ghostl/ghost-sdk";
//# sourceMappingURL=index.d.ts.map
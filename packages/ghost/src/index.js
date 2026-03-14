"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = void 0;
// Re-export the entire @ghostl/ghost-sdk surface as named exports.
__exportStar(require("@ghostl/ghost-sdk"), exports);
// Re-export the branded `ghost` namespace as the default export
// so that `import ghost from "ghost"` works.
var ghost_sdk_1 = require("@ghostl/ghost-sdk");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return ghost_sdk_1.ghost; } });

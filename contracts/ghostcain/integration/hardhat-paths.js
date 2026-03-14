/**
 * Integration snippet: add @ghostchain/contracts paths to ghostl-stack's
 * hardhat.config.ts.  Merge the `paths` block below into the existing config.
 *
 * Usage (ghostl-stack/hardhat.config.ts):
 *
 *   import { HardhatUserConfig } from "hardhat/config";
 *   import "@nomicfoundation/hardhat-toolbox";
 *   // ... other plugins ...
 *
 *   const config: HardhatUserConfig = {
 *     solidity: {
 *       compilers: [
 *         { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
 *       ],
 *     },
 *     // ── Add this paths block ──────────────────────────────────────────
 *     paths: {
 *       sources:   "./src",
 *       tests:     "./test",
 *       cache:     "./cache",
 *       artifacts: "./out-codex",
 *     },
 *     // ─────────────────────────────────────────────────────────────────
 *   };
 *
 *   export default config;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Import path resolution for @ghostchain/contracts:
 *
 * After adding "@ghostchain/contracts": "file:../../openzepconvert/..."
 * to package.json and running `npm install`, Hardhat automatically resolves
 * import "@ghostchain/contracts/token/GRC20/GRC20.sol"
 * via node_modules/@ghostchain/contracts/contracts/token/GRC20/GRC20.sol
 *
 * No additional hardhat-config changes are required for path resolution.
 * ─────────────────────────────────────────────────────────────────────────────
 */

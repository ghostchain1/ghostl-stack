// GhostChain Contracts v5.6.1 (script/DeployDeFiCore.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { GhostLend } from "../src/defi/GhostLend.sol";
import { GhostStable } from "../src/defi/GhostStable.sol";
import { GhostYield } from "../src/defi/GhostYield.sol";
import { GhostDerivatives } from "../src/defi/GhostDerivatives.sol";

/// @title DeployDeFiCore
/// @notice Forge broadcast script — deploys all GhostChain DeFi core contracts to L1.
///
/// Required environment variables:
///   DEPLOYER      — address that signs the deployment transactions
///   CANONICAL_GST — GST token address (ERC-20 compatible)
///   TREASURY      — treasury address (receives protocol fees)
///   GOVERNANCE    — GhostChainGovernor address (admin for DeFi contracts)
///
/// Optional environment variables:
///   GHOST_ORACLE  — price oracle address (zero address uses fallback / dev mode)
///
/// Usage (devnet):
///   forge script script/DeployDeFiCore.sol \
///     --private-key $DEPLOYER_KEY \
///     --rpc-url http://localhost:18545 \
///     --broadcast
///
/// Usage (testnet / prod — use hardware wallet):
///   forge script script/DeployDeFiCore.sol \
///     --ledger \
///     --rpc-url $L1_RPC \
///     --broadcast \
///     --verify
contract DeployDeFiCore is Script {
    // ─── Deployed addresses (written to console + broadcast JSON) ────────────

    GhostLend        public ghostLend;
    GhostStable      public ghostStable;
    GhostYield       public ghostYield;
    GhostDerivatives public ghostDerivatives;

    // ─── Entry point ─────────────────────────────────────────────────────────

    function run() external {
        address deployer   = vm.envAddress("DEPLOYER");
        address gstToken   = vm.envAddress("CANONICAL_GST");
        address treasury   = vm.envAddress("TREASURY");
        address governance = vm.envAddress("GOVERNANCE");
        address oracle     = vm.envOr("GHOST_ORACLE", address(0));

        // ── Validate inputs ──────────────────────────────────────────────────
        require(deployer   != address(0), "DeployDeFiCore: deployer is zero");
        require(gstToken   != address(0), "DeployDeFiCore: GST token is zero");
        require(treasury   != address(0), "DeployDeFiCore: treasury is zero");
        require(governance != address(0), "DeployDeFiCore: governance is zero");

        console2.log("=== DeployDeFiCore ===");
        console2.log("Deployer:   ", deployer);
        console2.log("GST token:  ", gstToken);
        console2.log("Treasury:   ", treasury);
        console2.log("Governance: ", governance);
        console2.log("Oracle:     ", oracle);
        console2.log("");

        vm.startBroadcast(deployer);

        // 1. GhostLend — overcollateralized lending
        ghostLend = new GhostLend(gstToken, treasury, governance);
        console2.log("GhostLend deployed:        ", address(ghostLend));

        // 2. GhostStable — GST-backed gUSD stablecoin (requires oracle)
        ghostStable = new GhostStable(gstToken, treasury, governance, oracle);
        console2.log("GhostStable deployed:      ", address(ghostStable));

        // 3. GhostYield — multi-strategy yield aggregator
        ghostYield = new GhostYield(gstToken, treasury, governance);
        console2.log("GhostYield deployed:       ", address(ghostYield));

        // 4. GhostDerivatives — GST perpetual futures (requires oracle)
        ghostDerivatives = new GhostDerivatives(gstToken, treasury, governance, oracle);
        console2.log("GhostDerivatives deployed: ", address(ghostDerivatives));

        vm.stopBroadcast();

        // ── Emit summary ─────────────────────────────────────────────────────
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("GhostLend:        ", address(ghostLend));
        console2.log("GhostStable:      ", address(ghostStable));
        console2.log("GhostYield:       ", address(ghostYield));
        console2.log("GhostDerivatives: ", address(ghostDerivatives));
        console2.log("");
        console2.log("All GhostChain DeFi core contracts deployed.");
    }
}

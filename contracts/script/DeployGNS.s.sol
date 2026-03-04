// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/gns/GNSRegistry.sol";
import "../src/gns/GNSResolver.sol";
import "../src/gns/GNSNameWrapper.sol";
import "../src/gns/GNSConstitutionGuard.sol";

/// @title DeployGNS
/// @notice Deploys the full Ghost Name Service stack on L1 (GhostChain).
///
///   L1:  forge script script/DeployGNS.s.sol:DeployGNS \
///              --rpc-url $RPC_L1 \
///              --private-key $DEPLOYER_PRIVATE_KEY \
///              --chain-id $L1_CHAIN_ID \
///              --broadcast -vvvv
///
/// Environment variables (required):
///   DEPLOYER_PRIVATE_KEY   — hex private key of the deployer
///   GNS_GOVERNANCE_ADDRESS — governance/multisig address (optional; defaults to deployer)
///   GNS_GHOSTBRAIN_ADDRESS — GhostBrain Core monitoring address (optional)
///
/// Phase 2 (L2 aggregator) and Phase 3 (L3 portal) are deployed separately
/// once the L1 registry address is known.
contract DeployGNS is Script {
    function run() external {
        uint256 deployerKey   = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer      = vm.addr(deployerKey);
        address governance    = vm.envOr("GNS_GOVERNANCE_ADDRESS", deployer);
        address ghostBrain    = vm.envOr("GNS_GHOSTBRAIN_ADDRESS", deployer);

        console.log("=== DeployGNS ===");
        console.log("Deployer   :", deployer);
        console.log("Governance :", governance);
        console.log("GhostBrain :", ghostBrain);
        console.log("ChainId    :", block.chainid);

        vm.startBroadcast(deployerKey);

        // ── Phase 1: L1 Core ──────────────────────────────────────────────────
        GNSRegistry registry = new GNSRegistry(governance);
        console.log("GNSRegistry         :", address(registry));
        console.log("  GHOST_ROOT        :", vm.toString(registry.GHOST_ROOT()));
        console.log("  governance        :", registry.governance());

        GNSResolver resolver = new GNSResolver(address(registry));
        console.log("GNSResolver         :", address(resolver));

        // Set default resolver on the .ghost root
        // (governance already owns the root — broadcast as deployer then hand off)
        // If deployer == governance, we set it directly.
        if (deployer == governance) {
            registry.setResolver(registry.GHOST_ROOT(), address(resolver));
            console.log("  Resolver set on .ghost root");
        }

        GNSNameWrapper wrapper = new GNSNameWrapper(address(registry));
        console.log("GNSNameWrapper      :", address(wrapper));

        GNSConstitutionGuard guard = new GNSConstitutionGuard(
            address(registry),
            address(0),   // governance contract (set via setGovernance later)
            governance
        );
        guard.setGhostBrainCore(ghostBrain);
        console.log("GNSConstitutionGuard:", address(guard));

        // ── Authorise the guard as a governance delegate for lockName ──────────
        // The guard calls registry.lockName() — grant it governance role via
        // the registry's governance address by setting it as the l2Bridge
        // temporarily, OR via a setGovernance to a multisig that includes guard.
        // For now, emit the addresses for manual wiring post-deploy.

        vm.stopBroadcast();

        console.log("");
        console.log("=== GNS L1 Deployment Complete ===");
        console.log("Next steps:");
        console.log("  1. Set registry.setL2Bridge(<L2_AGGREGATOR_ADDR>) from governance");
        console.log("  2. Deploy GNSAggregator on L2 with registry =", address(registry));
        console.log("  3. Deploy GNSUserPortal on L3 with aggregator = <L2_AGGREGATOR_ADDR>");
        console.log("  4. Set guard in registry governance hook");
        console.log("  5. Wire GhostBrain Core to guard.freezeName()");

        // ── Write deployment JSON ─────────────────────────────────────────────
        string memory json = string(abi.encodePacked(
            '{"GNSRegistry":"',          vm.toString(address(registry)),
            '","GNSResolver":"',         vm.toString(address(resolver)),
            '","GNSNameWrapper":"',      vm.toString(address(wrapper)),
            '","GNSConstitutionGuard":"',vm.toString(address(guard)),
            '","ghostRoot":"',           vm.toString(registry.GHOST_ROOT()),
            '","governance":"',          vm.toString(governance),
            '","deployedAt":',           vm.toString(block.timestamp),
            '}'
        ));
        vm.writeJson(json, string(abi.encodePacked(
            "./deployments/gns-l1-", vm.toString(block.chainid), ".json"
        )));
        console.log("Deployment JSON written to deployments/gns-l1-<chainId>.json");
    }
}

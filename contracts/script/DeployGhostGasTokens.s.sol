// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GhostGasTokens.sol";
import "../src/GhostTokenL2.sol";
import "../src/GhostBrand.sol";

/// @title DeployGhostGasTokens
/// @notice Deploys GhostGasTokenL2, GhostGasTokenL3, and GhostTokenL2 on the target chain.
///         Run once per layer:
///
///   L2:  forge script script/DeployGhostGasTokens.s.sol:DeployGhostGasTokens \
///              --rpc-url $RPC_L2 --private-key $DEPLOYER_PRIVATE_KEY \
///              --chain-id 901 --broadcast -vvvv
///
///   L3:  forge script script/DeployGhostGasTokens.s.sol:DeployGhostGasTokens \
///              --rpc-url $RPC_L3 --private-key $DEPLOYER_PRIVATE_KEY \
///              --chain-id 903 --broadcast -vvvv
///
///   L1:  forge script script/DeployGhostGasTokens.s.sol:DeployGhostGasTokens \
///              --rpc-url $RPC_L1 --private-key $DEPLOYER_PRIVATE_KEY \
///              --chain-id 14000101 --broadcast -vvvv
contract DeployGhostGasTokens is Script, GhostBrand {
    // 1 billion GST initial supply (same as genesis alloc)
    uint256 constant INITIAL_SUPPLY = 1_000_000_000 * GST_UNIT;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        uint256 chainId     = block.chainid;

        console.log("=== DeployGhostGasTokens ===");
        console.log("Deployer :", deployer);
        console.log("ChainId  :", chainId);
        console.log("Supply   :", INITIAL_SUPPLY / GST_UNIT, "GST");

        vm.startBroadcast(deployerKey);

        if (chainId == L2_CHAIN_ID) {
            _deployL2(deployer);
        } else if (chainId == L3_CHAIN_ID) {
            _deployL3(deployer);
        } else if (chainId == L1_CHAIN_ID) {
            // On L1 the native token is genesis-preallocated; no GST20 needed.
            // GhostTokenL2 is L2-specific so we skip it here.
            console.log("L1: no GST20 gas token deployment required (native GST via genesis alloc).");
        } else {
            revert(string.concat("Unknown chainId: ", vm.toString(chainId)));
        }

        vm.stopBroadcast();
    }

    function _deployL2(address deployer) internal {
        console.log("--- Deploying on GhostL2 (chainId=901) ---");

        GhostGasTokenL2 l2Token = new GhostGasTokenL2(INITIAL_SUPPLY);
        console.log("GhostGasTokenL2 :", address(l2Token));
        console.log("  name          :", l2Token.name());
        console.log("  symbol        :", l2Token.symbol());
        console.log("  totalSupply   :", l2Token.totalSupply() / GST_UNIT, "GST");
        console.log("  owner         :", l2Token.owner());

        GhostTokenL2 legacyL2 = new GhostTokenL2();
        console.log("GhostTokenL2    :", address(legacyL2));
        console.log("  name          :", legacyL2.name());
        console.log("  symbol        :", legacyL2.symbol());

        // Grant deployer minter rights on the primary token
        l2Token.setMinter(deployer, true);
        console.log("Minter set      :", deployer);
    }

    function _deployL3(address deployer) internal {
        console.log("--- Deploying on GhostL3 (chainId=903) ---");

        GhostGasTokenL3 l3Token = new GhostGasTokenL3(INITIAL_SUPPLY);
        console.log("GhostGasTokenL3 :", address(l3Token));
        console.log("  name          :", l3Token.name());
        console.log("  symbol        :", l3Token.symbol());
        console.log("  totalSupply   :", l3Token.totalSupply() / GST_UNIT, "GST");
        console.log("  owner         :", l3Token.owner());

        // Grant deployer minter rights
        l3Token.setMinter(deployer, true);
        console.log("Minter set      :", deployer);
    }
}

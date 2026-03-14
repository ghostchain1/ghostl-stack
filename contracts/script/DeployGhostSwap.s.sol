// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (script/DeployGhostSwap.s.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import { WGST9 }             from "../src/tokens/WGST9.sol";
import { WGST10 }            from "../src/tokens/WGST10.sol";
import { GhostFactory }      from "../src/ghostswap/GhostFactory.sol";
import { GhostRouter }       from "../src/ghostswap/GhostRouter.sol";
import { WGSTBridgeAdapter } from "../src/ghostswap/WGSTBridgeAdapter.sol";

/// @title DeployGhostSwap
/// @notice Forge deploy script for the full GhostSwap AMM + WGST stack.
///
///         Deploys in this order:
///           1. WGST9         — canonical wrapped native GST (L1 reference)
///           2. WGST10        — enhanced variant with EIP-2612 permit + flash mint
///           3. GhostFactory  — pair registry (CREATE2 pair deployment)
///           4. GhostRouter   — periphery router (addLiquidity / swap / removeLiquidity)
///           5. WGSTBridgeAdapter — L1/L2/L3 cross-domain bridge adapter
///
///         Usage (dry-run on GhostChain L1):
///           forge script script/DeployGhostSwap.s.sol \
///             --rpc-url $L1_RPC_URL \
///             --broadcast \
///             --sender $DEPLOYER
///
///         Usage (L2):
///           forge script script/DeployGhostSwap.s.sol \
///             --rpc-url $L2_RPC_URL \
///             --broadcast \
///             --sender $DEPLOYER
///
///         Required env vars:
///           DEPLOYER_PRIVATE_KEY   — deploying account private key
///           FEE_TO_SETTER          — address that controls protocol fee routing
///           MESSENGER              — OP Stack CrossDomainMessenger on this layer
///           REMOTE_ADAPTER         — WGSTBridgeAdapter address on the adjacent layer
///           IS_CANONICAL           — "true" for L1, "false" for L2/L3
///
///         Optional:
///           WGST9_OVERRIDE         — set to reuse an existing WGST9 deployment
///           WGST10_OVERRIDE        — set to reuse an existing WGST10 deployment
///           FACTORY_OVERRIDE       — set to reuse an existing GhostFactory
contract DeployGhostSwap is Script {
    function run() external {
        address deployer     = vm.envAddress("DEPLOYER");
        address feeToSetter  = vm.envOr("FEE_TO_SETTER", deployer);
        address messenger    = vm.envAddress("MESSENGER");
        address remoteAdapter= vm.envAddress("REMOTE_ADAPTER");
        bool    isCanonical  = _parseBool(vm.envOr("IS_CANONICAL", string("true")));

        // Optional overrides (skip redeployment if already live).
        address wgst9Override   = vm.envOr("WGST9_OVERRIDE",   address(0));
        address wgst10Override  = vm.envOr("WGST10_OVERRIDE",  address(0));
        address factoryOverride = vm.envOr("FACTORY_OVERRIDE", address(0));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // ── 1. WGST9 ─────────────────────────────────────────────────────────
        address wgst9Addr;
        if (wgst9Override != address(0)) {
            wgst9Addr = wgst9Override;
            console.log("WGST9 (reused):", wgst9Addr);
        } else {
            WGST9 wgst9 = new WGST9();
            wgst9Addr   = address(wgst9);
            console.log("WGST9 deployed:", wgst9Addr);
        }

        // ── 2. WGST10 ────────────────────────────────────────────────────────
        address wgst10Addr;
        if (wgst10Override != address(0)) {
            wgst10Addr = wgst10Override;
            console.log("WGST10 (reused):", wgst10Addr);
        } else {
            WGST10 wgst10 = new WGST10();
            wgst10Addr    = address(wgst10);
            console.log("WGST10 deployed:", wgst10Addr);
        }

        // ── 3. GhostFactory ──────────────────────────────────────────────────
        address factoryAddr;
        if (factoryOverride != address(0)) {
            factoryAddr = factoryOverride;
            console.log("GhostFactory (reused):", factoryAddr);
        } else {
            GhostFactory factory = new GhostFactory(feeToSetter);
            factoryAddr          = address(factory);
            console.log("GhostFactory deployed:", factoryAddr);
        }

        // ── 4. GhostRouter ───────────────────────────────────────────────────
        // Router uses WGST9 as the canonical wrapped native.
        GhostRouter router = new GhostRouter(factoryAddr, wgst9Addr);
        console.log("GhostRouter deployed:", address(router));

        // ── 5. WGSTBridgeAdapter ─────────────────────────────────────────────
        // Bridge adapter targets WGST9 (canonical).
        WGSTBridgeAdapter bridge = new WGSTBridgeAdapter(
            wgst9Addr,
            messenger,
            remoteAdapter,
            isCanonical
        );
        console.log("WGSTBridgeAdapter deployed:", address(bridge));
        console.log("  isCanonical:", isCanonical);

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("=== GhostSwap Deployment Summary ===");
        console.log("Chain ID    :", block.chainid);
        console.log("Deployer    :", deployer);
        console.log("WGST9       :", wgst9Addr);
        console.log("WGST10      :", wgst10Addr);
        console.log("GhostFactory:", factoryAddr);
        console.log("GhostRouter :", address(router));
        console.log("BridgeAdptr :", address(bridge));
    }

    /// @dev Parse "true"/"false" env string to bool.
    function _parseBool(string memory s) internal pure returns (bool) {
        return keccak256(bytes(s)) == keccak256(bytes("true"));
    }
}

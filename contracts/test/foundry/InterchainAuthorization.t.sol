// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/InterchainAuthorization.sol";

contract InterchainAuthorizationTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant OPERATOR = address(0x1111);
    address private constant ATTACKER = address(0xD00D);

    uint256 private constant DST_CHAIN_ID = 1;
    address private constant ASSET = address(0xAAAA);
    address private constant ADAPTER = address(0xBBBB);

    function testOnlyGovernanceCanConfigure() public {
        InterchainAuthorization auth = new InterchainAuthorization(GOVERNOR, TIMELOCK, true);

        vm.prank(ATTACKER);
        vm.expectRevert(bytes("NOT_EXECUTOR"));
        auth.setChainAllowed(DST_CHAIN_ID, true);

        vm.prank(GOVERNOR);
        auth.setChainAllowed(DST_CHAIN_ID, true);
        assertTrue(auth.chainAllowed(DST_CHAIN_ID), "chain allowed");

        vm.prank(TIMELOCK);
        auth.setAdapterAllowed(ADAPTER, true);
        assertTrue(auth.adapterAllowed(ADAPTER), "adapter allowed");
    }

    function testPausedAndDisabledShortCircuit() public {
        InterchainAuthorization authDisabled = new InterchainAuthorization(GOVERNOR, TIMELOCK, false);
        InterchainAuthorization.EgressDecision memory d =
            authDisabled.checkEgress(DST_CHAIN_ID, ASSET, ADAPTER, 1);
        assertTrue(!d.allowed, "disabled not allowed");
        assertEq(d.reason, keccak256("ghost.interchain.reason.disabled"), "disabled reason");

        InterchainAuthorization authPaused = new InterchainAuthorization(GOVERNOR, TIMELOCK, true);
        vm.prank(GOVERNOR);
        authPaused.setPaused(true);
        d = authPaused.checkEgress(DST_CHAIN_ID, ASSET, ADAPTER, 1);
        assertTrue(!d.allowed, "paused not allowed");
        assertEq(d.reason, keccak256("ghost.interchain.reason.paused"), "paused reason");
    }

    function testCapsEnforcedWithConsume() public {
        InterchainAuthorization auth = new InterchainAuthorization(GOVERNOR, TIMELOCK, true);

        vm.prank(GOVERNOR);
        auth.setChainAllowed(DST_CHAIN_ID, true);
        vm.prank(GOVERNOR);
        auth.setAdapterAllowed(ADAPTER, true);
        vm.prank(GOVERNOR);
        auth.setAssetAllowed(ASSET, true);
        vm.prank(GOVERNOR);
        auth.setOperator(OPERATOR, true);
        vm.prank(GOVERNOR);
        auth.setCapConfig(DST_CHAIN_ID, ASSET, 80, 100, true);

        InterchainAuthorization.EgressDecision memory d = auth.checkEgress(DST_CHAIN_ID, ASSET, ADAPTER, 90);
        assertTrue(!d.allowed, "over per-tx cap not allowed");
        assertEq(d.reason, keccak256("ghost.interchain.reason.cap.per_tx"), "per-tx reason");

        vm.prank(OPERATOR);
        auth.consumeEgress(DST_CHAIN_ID, ASSET, ADAPTER, 60);

        vm.prank(OPERATOR);
        vm.expectRevert(
            abi.encodeWithSelector(
                InterchainAuthorization.EgressDenied.selector,
                keccak256("ghost.interchain.reason.cap.per_window")
            )
        );
        auth.consumeEgress(DST_CHAIN_ID, ASSET, ADAPTER, 50);

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(OPERATOR);
        auth.consumeEgress(DST_CHAIN_ID, ASSET, ADAPTER, 80);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/GhostChainBridgeHub.sol";

contract GhostChainBridgeHubTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant OPERATOR = address(0x1111);
    uint8 private constant LAYER_L1 = 1;
    uint8 private constant LAYER_L2 = 2;

    function testLayerRootRecordingAndOutboundConstraint() public {
        GhostChainBridgeHub hub = new GhostChainBridgeHub(GOVERNOR, TIMELOCK, InterchainAuthorization(address(0)));

        vm.prank(GOVERNOR);
        hub.setOperator(OPERATOR, true);
        vm.prank(GOVERNOR);
        hub.setLayerRootPostingEnabled(LAYER_L2, true);
        vm.prank(GOVERNOR);
        hub.setExternalChainAllowed(42161, true);

        bytes32 l2Root = keccak256("l2-root-v1");
        vm.prank(OPERATOR);
        hub.recordLayerRoot(LAYER_L2, l2Root, 123, keccak256("evidence"));

        assertTrue(hub.hasLayerRoot(LAYER_L2, l2Root), "l2 root recorded");

        vm.prank(OPERATOR);
        bytes32 messageId = hub.queueOutboundMessage(
            LAYER_L1,
            42161,
            address(0xAAAA),
            100,
            keccak256("payload")
        );

        assertTrue(messageId != bytes32(0), "message queued");

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.OnlyGhostChainEgress.selector, uint8(2)));
        hub.queueOutboundMessage(uint8(2), 42161, address(0xAAAA), 100, keccak256("payload-2"));
    }
}

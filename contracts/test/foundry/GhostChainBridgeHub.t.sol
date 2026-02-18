// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/GhostChainBridgeHub.sol";
import "../../src/governance/bridge/L1FinalityOracle.sol";

contract GhostChainBridgeHubTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant OPERATOR = address(0x1111);
    uint8 private constant LAYER_L1 = 1;
    uint8 private constant LAYER_L2 = 2;
    uint8 private constant LAYER_L3 = 3;
    bytes32 private constant POLICY_HASH = keccak256("policy-v1");

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
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.RootAlreadyRecorded.selector, l2Root));
        hub.recordLayerRoot(LAYER_L2, l2Root, 124, keccak256("evidence-duplicate"));

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

    function testL3RootRequiresParentL2Root() public {
        GhostChainBridgeHub hub = new GhostChainBridgeHub(GOVERNOR, TIMELOCK, InterchainAuthorization(address(0)));

        vm.prank(GOVERNOR);
        hub.setOperator(OPERATOR, true);
        vm.prank(GOVERNOR);
        hub.setLayerRootPostingEnabled(LAYER_L2, true);
        vm.prank(GOVERNOR);
        hub.setLayerRootPostingEnabled(LAYER_L3, true);

        bytes32 l2Root = keccak256("l2-root-parent");
        bytes32 l3Root = keccak256("l3-root-child");
        bytes32 l2RootAlt = keccak256("l2-root-alt");

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.L3RequiresParentL2Root.selector));
        hub.recordLayerRoot(LAYER_L3, l3Root, 200, keccak256("l3-evidence-direct"));

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.L2ParentRootNotRecorded.selector, l2Root));
        hub.recordL3LayerRoot(l3Root, l2Root, 201, keccak256("l3-evidence-missing-parent"));

        vm.prank(OPERATOR);
        hub.recordLayerRoot(LAYER_L2, l2Root, 123, keccak256("l2-evidence"));
        vm.prank(OPERATOR);
        hub.recordLayerRoot(LAYER_L2, l2RootAlt, 124, keccak256("l2-evidence-alt"));

        vm.prank(OPERATOR);
        hub.recordL3LayerRoot(l3Root, l2Root, 202, keccak256("l3-evidence-linked"));

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.RootAlreadyRecorded.selector, l3Root));
        hub.recordL3LayerRoot(l3Root, l2RootAlt, 203, keccak256("l3-evidence-relinked"));

        assertTrue(hub.hasLayerRoot(LAYER_L3, l3Root), "l3 root recorded");
        assertEq(hub.l3ParentL2Roots(l3Root), l2Root, "l3 parent linked");
        assertTrue(hub.isLinkedL3ToL2(l3Root, l2Root), "link verification");
    }

    function testReadOnlyModeBlocksOperatorsAndTracksL1Halt() public {
        GhostChainBridgeHub hub = new GhostChainBridgeHub(GOVERNOR, TIMELOCK, InterchainAuthorization(address(0)));
        L1FinalityOracle l1Oracle = new L1FinalityOracle(GOVERNOR, TIMELOCK);

        vm.prank(GOVERNOR);
        hub.setOperator(OPERATOR, true);
        vm.prank(GOVERNOR);
        hub.setLayerRootPostingEnabled(LAYER_L2, true);
        vm.prank(GOVERNOR);
        hub.setExternalChainAllowed(42161, true);
        vm.prank(GOVERNOR);
        hub.setL1FinalityOracle(IFinalityHaltOracle(address(l1Oracle)));

        bytes32 l2Root = keccak256("l2-readonly-root");

        vm.prank(GOVERNOR);
        hub.setReadOnlyMode(true, keccak256("manual-readonly"));
        assertTrue(hub.isReadOnlyMode(), "manual readonly active");

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.ReadOnlyModeActive.selector));
        hub.recordLayerRoot(LAYER_L2, l2Root, 10, keccak256("blocked-readonly"));

        vm.prank(GOVERNOR);
        hub.recordLayerRoot(LAYER_L2, l2Root, 11, keccak256("governance-override"));

        vm.prank(TIMELOCK);
        hub.setReadOnlyMode(false, bytes32(0));
        assertTrue(!hub.isReadOnlyMode(), "manual readonly cleared");

        vm.prank(OPERATOR);
        bytes32 messageId = hub.queueOutboundMessage(
            LAYER_L1,
            42161,
            address(0xAAAA),
            7,
            keccak256("payload-before-halt")
        );

        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(TIMELOCK);
        l1Oracle.setFinalityHalted(true);
        assertTrue(hub.isReadOnlyMode(), "readonly via l1 halt");

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.ReadOnlyModeActive.selector));
        hub.queueOutboundMessage(LAYER_L1, 42161, address(0xAAAA), 8, keccak256("payload-after-halt"));

        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(GhostChainBridgeHub.ReadOnlyModeActive.selector));
        hub.markOutboundExecuted(messageId, keccak256("external-tx"));

        vm.prank(GOVERNOR);
        hub.markOutboundExecuted(messageId, keccak256("external-tx-governance"));
    }
}

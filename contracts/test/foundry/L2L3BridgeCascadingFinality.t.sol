// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/GuardPolicy.sol";
import "../../src/L2L3Bridge.sol";
import "../../src/tokens/TestERC20.sol";
import "../../src/governance/bridge/L1FinalityOracle.sol";
import "../../src/governance/bridge/L2FinalityOracle.sol";
import "../../src/governance/bridge/L3FinalityOracle.sol";

contract L2L3BridgeCascadingFinalityTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant RELAYER = address(0x1111);

    bytes32 private constant POLICY_HASH = keccak256("policy-v1");
    bytes32 private constant L1_BLOCK_HASH = keccak256("l1-block-100");
    bytes32 private constant L1_QC_HASH = keccak256("l1-qc-100");

    GuardPolicy private policy;
    L2L3Bridge private bridge;
    TestERC20 private token;

    L1FinalityOracle private l1Oracle;
    L2FinalityOracle private l2Oracle;
    L3FinalityOracle private l3Oracle;

    bytes32 private l2Root = keccak256("l2-root-bridge");
    bytes32 private l3Root = keccak256("l3-root-bridge");

    function setUp() public {
        policy = new GuardPolicy();
        bridge = new L2L3Bridge(address(policy));
        bridge.setRelayer(RELAYER);
        bridge.setRequireComplianceRoot(false);

        l1Oracle = new L1FinalityOracle(GOVERNOR, TIMELOCK);
        l2Oracle = new L2FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle);
        l3Oracle = new L3FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle, l2Oracle);

        bridge.setL2FinalityOracle(address(l2Oracle));
        bridge.setL3FinalityOracle(address(l3Oracle));
        bridge.setEnforceHierarchicalFinality(true);

        token = new TestERC20("Ghost Test", "GTST", 18);
        token.mint(address(this), 1000 ether);
        token.approve(address(bridge), type(uint256).max);
    }

    function testL2FinalizeFailsBeforeL1Confirmation() public {
        bridge.depositToL3(address(this), 1 ether, 1);

        vm.prank(RELAYER);
        vm.expectRevert(bytes("L2_NOT_FINALIZED_ON_L1"));
        bridge.finalizeToL3WithFinality(address(this), address(this), 1 ether, 1, l2Root);
    }

    function testL3ReleaseFailsWithoutRecursiveFinality() public {
        bridge.depositERC20ToL3(address(token), address(this), 2 ether, 2);

        vm.prank(RELAYER);
        vm.expectRevert(bytes("L2_NOT_FINALIZED_ON_L1"));
        bridge.finalizeERC20ToL3WithFinality(address(token), address(this), address(this), 2 ether, 2, l2Root);

        _recordL1AndL2Finality();

        vm.prank(RELAYER);
        bridge.finalizeERC20ToL3WithFinality(address(token), address(this), address(this), 2 ether, 2, l2Root);

        vm.prank(RELAYER);
        vm.expectRevert(bytes("L3_NOT_FINALIZED_ON_L2"));
        bridge.releaseERC20FromL3WithFinality(
            address(token),
            address(this),
            address(this),
            2 ether,
            2,
            l3Root,
            l2Root
        );

        _recordL3Finality();

        vm.prank(RELAYER);
        vm.expectRevert(bytes("L2_PARENT_NOT_FINALIZED_ON_L1"));
        bridge.releaseERC20FromL3WithFinality(
            address(token),
            address(this),
            address(this),
            2 ether,
            2,
            l3Root,
            keccak256("wrong-parent")
        );

        vm.prank(RELAYER);
        bridge.releaseERC20FromL3WithFinality(
            address(token),
            address(this),
            address(this),
            2 ether,
            2,
            l3Root,
            l2Root
        );
    }

    function testBridgeFinalityPathBlockedWhenL1FinalityHalted() public {
        _recordL1AndL2Finality();
        bridge.depositToL3(address(this), 1 ether, 77);

        vm.prank(GOVERNOR);
        l1Oracle.setFinalityHalted(true);

        vm.prank(RELAYER);
        vm.expectRevert(bytes("L1_FINALITY_HALTED"));
        bridge.finalizeToL3WithFinality(address(this), address(this), 1 ether, 77, l2Root);
    }

    function _recordL1AndL2Finality() internal {
        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);
        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(l2Root, 200, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2"));
    }

    function _recordL3Finality() internal {
        vm.prank(TIMELOCK);
        l3Oracle.recordFinalizedL3Root(l3Root, 300, l2Root, 200, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l3"));
    }
}

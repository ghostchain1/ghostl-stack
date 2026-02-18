// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/governance/bridge/L1FinalityOracle.sol";
import "../../src/governance/bridge/L2FinalityOracle.sol";
import "../../src/governance/bridge/L3FinalityOracle.sol";

contract CascadingFinalityOraclesTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);

    bytes32 private constant POLICY_HASH = keccak256("policy-v1");
    bytes32 private constant L1_BLOCK_HASH = keccak256("l1-block-100");
    bytes32 private constant L1_QC_HASH = keccak256("l1-qc-100");

    L1FinalityOracle private l1Oracle;
    L2FinalityOracle private l2Oracle;
    L3FinalityOracle private l3Oracle;

    function setUp() public {
        l1Oracle = new L1FinalityOracle(GOVERNOR, TIMELOCK);
        l2Oracle = new L2FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle);
        l3Oracle = new L3FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle, l2Oracle);
    }

    function testL2RequiresL1Finality() public {
        bytes32 l2Root = keccak256("l2-root-1");

        vm.prank(GOVERNOR);
        vm.expectRevert(
            abi.encodeWithSelector(L2FinalityOracle.L1BlockNotFinalized.selector, uint256(100), L1_BLOCK_HASH)
        );
        l2Oracle.recordFinalizedL2Root(l2Root, 200, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2"));

        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);

        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(l2Root, 200, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2"));

        assertTrue(l2Oracle.isFinalizedOnL1(l2Root), "l2 finalized on l1");
    }

    function testL3RequiresParentL2FinalizedOnL1() public {
        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);

        bytes32 l3Root = keccak256("l3-root-1");
        bytes32 missingParent = keccak256("missing-parent-l2");

        vm.prank(TIMELOCK);
        vm.expectRevert(abi.encodeWithSelector(L3FinalityOracle.L2ParentNotFinalizedOnL1.selector, missingParent));
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            300,
            missingParent,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3")
        );

        bytes32 parentL2Root = keccak256("l2-root-2");
        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(parentL2Root, 201, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-2"));

        vm.prank(TIMELOCK);
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            301,
            parentL2Root,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3-2")
        );

        assertTrue(l3Oracle.isFinalizedOnL2(l3Root), "l3 finalized on l2");
        assertTrue(l3Oracle.isParentL2FinalizedOnL1(parentL2Root), "parent l2 finalized on l1");
    }
}

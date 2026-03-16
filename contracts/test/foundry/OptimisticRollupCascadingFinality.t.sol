// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/OptimisticRollup.sol";
import "../../src/governance/bridge/L1FinalityOracle.sol";
import "../../src/governance/bridge/L2FinalityOracle.sol";

contract OptimisticRollupCascadingFinalityTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant PROPOSER = address(0xA11);

    bytes32 private constant POLICY_HASH = keccak256("policy-v1");
    bytes32 private constant L1_BLOCK_HASH = keccak256("l1-block-100");
    bytes32 private constant L1_QC_HASH = keccak256("l1-qc-100");

    L1FinalityOracle private l1Oracle;
    L2FinalityOracle private l2Oracle;
    OptimisticRollup private rollup;

    function setUp() public {
        l1Oracle = new L1FinalityOracle(GOVERNOR, TIMELOCK);
        l2Oracle = new L2FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle);
        rollup = new OptimisticRollup(901, 1 days, PROPOSER);

        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);

        rollup.setParentFinalityOracle(address(l2Oracle));
    }

    function testFinalizeBlockedUntilRootFinalizedAndPolicyAnnotated() public {
        bytes32 l2Root = keccak256("l2-root-rollup-1");

        vm.prank(PROPOSER);
        uint256 batchId = rollup.proposeBatch(10, 20, l2Root);

        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(bytes("PARENT_ROOT_NOT_FINALIZED"));
        rollup.finalizeBatch(batchId);

        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(l2Root, 20, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-rollup-1"));

        vm.expectRevert(bytes("POLICY_HASH_MISSING"));
        rollup.finalizeBatch(batchId);

        vm.prank(PROPOSER);
        rollup.setBatchPolicyHash(batchId, POLICY_HASH);

        rollup.finalizeBatch(batchId);
    }

    function testPolicyMismatchBlocked() public {
        bytes32 l2Root = keccak256("l2-root-rollup-2");

        vm.prank(PROPOSER);
        uint256 batchId = rollup.proposeBatchWithPolicy(21, 30, l2Root, keccak256("wrong-policy"));

        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(l2Root, 30, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-rollup-2"));

        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(bytes("POLICY_HASH_MISMATCH"));
        rollup.finalizeBatch(batchId);
    }
}

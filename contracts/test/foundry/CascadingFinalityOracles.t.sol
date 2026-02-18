// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/consensus-governance/ConsensusEvidenceRootStore.sol";
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
    ConsensusEvidenceRootStore private evidenceStore;

    function setUp() public {
        l1Oracle = new L1FinalityOracle(GOVERNOR, TIMELOCK);
        l2Oracle = new L2FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle);
        l3Oracle = new L3FinalityOracle(GOVERNOR, TIMELOCK, l1Oracle, l2Oracle);
        evidenceStore = new ConsensusEvidenceRootStore(GOVERNOR, TIMELOCK);
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
        assertEq(l2Oracle.canonicalRootByL2Block(200), l2Root, "l2 canonical root bound");
    }

    function testL2RejectsCanonicalRootConflictAndSupportsDivergenceEvidence() public {
        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);

        bytes32 canonicalRoot = keccak256("l2-root-canonical");
        bytes32 conflictingRoot = keccak256("l2-root-conflict");
        bytes32 evidenceHash = keccak256("l2-divergence-evidence");

        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(canonicalRoot, 250, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-canonical"));

        vm.prank(GOVERNOR);
        evidenceStore.setReporter(address(l2Oracle), true);
        vm.prank(GOVERNOR);
        l2Oracle.setEvidenceRootStore(evidenceStore);

        vm.prank(TIMELOCK);
        vm.expectRevert(
            abi.encodeWithSelector(
                L2FinalityOracle.L2CanonicalRootMismatch.selector,
                uint256(250),
                canonicalRoot,
                conflictingRoot
            )
        );
        l2Oracle.recordFinalizedL2Root(conflictingRoot, 250, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-conflict"));

        vm.prank(GOVERNOR);
        bool reported = l2Oracle.reportCanonicalRootDivergence(250, conflictingRoot, evidenceHash);
        assertTrue(reported, "divergence evidence reported");
        assertTrue(
            evidenceStore.knownRootByKind(l2Oracle.KIND_L2_CANONICAL_DIVERGENCE(), evidenceHash),
            "divergence evidence anchored"
        );

        vm.prank(TIMELOCK);
        bool noConflict = l2Oracle.reportCanonicalRootDivergence(250, canonicalRoot, evidenceHash);
        assertTrue(!noConflict, "canonical root is not divergence");
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
            999,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3")
        );

        bytes32 parentL2Root = keccak256("l2-root-2");
        bytes32 altParentL2Root = keccak256("l2-root-3");
        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(parentL2Root, 201, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-2"));
        vm.prank(GOVERNOR);
        l2Oracle.recordFinalizedL2Root(altParentL2Root, 202, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-3"));
        vm.prank(GOVERNOR);
        evidenceStore.setReporter(address(l3Oracle), true);
        vm.prank(GOVERNOR);
        l3Oracle.setEvidenceRootStore(evidenceStore);

        vm.prank(TIMELOCK);
        vm.expectRevert(abi.encodeWithSelector(L3FinalityOracle.L2CanonicalRootUnavailable.selector, uint256(777)));
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            301,
            parentL2Root,
            777,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3-missing-canonical")
        );

        vm.prank(TIMELOCK);
        vm.expectRevert(
            abi.encodeWithSelector(
                L3FinalityOracle.L2ParentBlockCanonicalMismatch.selector, uint256(202), altParentL2Root, parentL2Root
            )
        );
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            301,
            parentL2Root,
            202,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3-canonical-mismatch")
        );

        bytes32 l3DivergenceEvidence = keccak256("l3-parent-divergence-evidence");
        vm.prank(TIMELOCK);
        bool l3Reported = l3Oracle.reportParentL2CanonicalDivergence(202, parentL2Root, l3DivergenceEvidence);
        assertTrue(l3Reported, "l3 parent divergence evidence reported");
        assertTrue(
            evidenceStore.knownRootByKind(l3Oracle.KIND_L3_PARENT_CANONICAL_DIVERGENCE(), l3DivergenceEvidence),
            "l3 parent divergence evidence anchored"
        );

        vm.prank(GOVERNOR);
        bool l3NoConflict = l3Oracle.reportParentL2CanonicalDivergence(201, parentL2Root, l3DivergenceEvidence);
        assertTrue(!l3NoConflict, "canonical parent is not divergence");

        vm.prank(TIMELOCK);
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            301,
            parentL2Root,
            201,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3-2")
        );

        assertTrue(l3Oracle.isFinalizedOnL2(l3Root), "l3 finalized on l2");
        assertTrue(l3Oracle.isParentL2FinalizedOnL1(parentL2Root), "parent l2 finalized on l1");
        assertEq(l3Oracle.parentL2Block(l3Root), 201, "parent l2 block bound");
    }

    function testL1HaltPropagatesToL2AndL3Finality() public {
        vm.prank(GOVERNOR);
        l1Oracle.setAcceptedPolicyHash(POLICY_HASH, true);
        vm.prank(GOVERNOR);
        l1Oracle.recordFinalizedBlock(100, L1_BLOCK_HASH, L1_QC_HASH, POLICY_HASH);

        bytes32 l2Root = keccak256("l2-root-halt");
        bytes32 l3Root = keccak256("l3-root-halt");

        vm.prank(TIMELOCK);
        l1Oracle.setFinalityHalted(true);
        assertTrue(l2Oracle.isFinalityHalted(), "l2 sees l1 halt");
        assertTrue(l3Oracle.isFinalityHalted(), "l3 sees l1 halt");

        vm.prank(GOVERNOR);
        vm.expectRevert(L2FinalityOracle.L1FinalityHalted.selector);
        l2Oracle.recordFinalizedL2Root(l2Root, 400, 100, L1_BLOCK_HASH, POLICY_HASH, keccak256("proof-l2-halt"));

        vm.prank(TIMELOCK);
        vm.expectRevert(L3FinalityOracle.L1FinalityHalted.selector);
        l3Oracle.recordFinalizedL3Root(
            l3Root,
            500,
            l2Root,
            400,
            100,
            L1_BLOCK_HASH,
            POLICY_HASH,
            keccak256("proof-l3-halt")
        );

        vm.prank(TIMELOCK);
        vm.expectRevert(L3FinalityOracle.L1FinalityHalted.selector);
        l3Oracle.reportParentL2CanonicalDivergence(400, l2Root, keccak256("l3-halt-divergence"));
    }
}

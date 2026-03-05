// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/constitutional/GovernanceExecutor.sol";

contract GovernanceExecutorTest is Test {
    GovernanceExecutor ge;

    address governor = address(0x1234);
    address executor = address(0x5678); // underlying ProposalExecutor stub

    uint256 constant L1 = 14000101;
    uint256 constant L2 = 901;
    uint256 constant L3 = 903;
    uint256 constant SUPPLY = 100_000_000 * 1e18;

    function setUp() public {
        ge = new GovernanceExecutor(governor, executor);
        vm.chainId(L2); // set current chain to L2
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _makeOGB(
        bytes32 leaf,
        bytes32[] memory proof,
        bytes32 root,
        uint256 nonce
    ) internal view returns (GovernanceExecutor.OGBParams memory) {
        return GovernanceExecutor.OGBParams({
            bundleDigest: keccak256(abi.encodePacked(root, nonce, block.chainid)),
            merkleRoot:   root,
            chainId:      block.chainid,
            nonce:        nonce,
            proposalLeaf: leaf,
            proof:        proof
        });
    }

    /// @dev Build a trivial one-leaf Merkle tree (root = sha256(leaf))
    function _trivialTree(bytes32 leaf) internal pure returns (bytes32 root, bytes32[] memory proof) {
        root = sha256(abi.encodePacked(leaf, leaf)); // single leaf: root = sha256(leaf||leaf)
        proof = new bytes32[](0); // no siblings for single-leaf tree... but our verifier needs 0 proofs
        // For a single leaf, root IS the leaf in a trivial tree
        root = leaf; // direct: root = leaf when proof is empty → passes _verifyMerkleProof
    }

    // ─── Happy path: GENERAL proposal ────────────────────────────────────────

    function test_executeWithBundle_general_passes() public {
        bytes32 leaf = keccak256("proposal-1");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);

        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 1);

        vm.prank(governor);
        ge.executeWithBundle(1, GovernanceExecutor.ProposalType.GENERAL, ogb, "");

        // Verify on-chain record
        GovernanceExecutor.ExecutionRecord memory rec = ge.getExecutionRecord(ogb.bundleDigest);
        assertTrue(rec.executed);
        assertEq(rec.proposalId, 1);
    }

    // ─── Replay protection ────────────────────────────────────────────────────

    function test_replay_same_bundle_reverts() public {
        bytes32 leaf = keccak256("proposal-2");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 2);

        vm.prank(governor);
        ge.executeWithBundle(2, GovernanceExecutor.ProposalType.GENERAL, ogb, "");

        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(
            GovernanceExecutor.GovernanceExecutor_BundleAlreadyConsumed.selector,
            ogb.bundleDigest
        ));
        ge.executeWithBundle(3, GovernanceExecutor.ProposalType.GENERAL, ogb, "");
    }

    function test_replay_same_proposalId_reverts() public {
        bytes32 leaf = keccak256("proposal-3");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 3);

        vm.prank(governor);
        ge.executeWithBundle(3, GovernanceExecutor.ProposalType.GENERAL, ogb, "");

        // Different bundle digest but same proposalId
        bytes32 leaf2 = keccak256("proposal-3b");
        (bytes32 root2, bytes32[] memory proof2) = _trivialTree(leaf2);
        GovernanceExecutor.OGBParams memory ogb2 = _makeOGB(leaf2, proof2, root2, 4);

        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(
            GovernanceExecutor.GovernanceExecutor_ProposalAlreadyExecuted.selector,
            3
        ));
        ge.executeWithBundle(3, GovernanceExecutor.ProposalType.GENERAL, ogb2, "");
    }

    // ─── Access control ───────────────────────────────────────────────────────

    function test_non_governor_reverts() public {
        bytes32 leaf = keccak256("proposal-4");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 5);

        vm.prank(address(0xBEEF)); // not governor
        vm.expectRevert(abi.encodeWithSelector(
            GovernanceExecutor.GovernanceExecutor_NotGovernor.selector,
            address(0xBEEF)
        ));
        ge.executeWithBundle(4, GovernanceExecutor.ProposalType.GENERAL, ogb, "");
    }

    // ─── Chain ID mismatch ────────────────────────────────────────────────────

    function test_wrong_chainId_reverts() public {
        bytes32 leaf = keccak256("proposal-5");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);

        GovernanceExecutor.OGBParams memory ogb = GovernanceExecutor.OGBParams({
            bundleDigest: keccak256("chain-mismatch"),
            merkleRoot:   root,
            chainId:      L1, // wrong — current chain is L2
            nonce:        6,
            proposalLeaf: leaf,
            proof:        proof
        });

        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(
            GovernanceExecutor.GovernanceExecutor_ChainIdMismatch.selector,
            L2, L1
        ));
        ge.executeWithBundle(5, GovernanceExecutor.ProposalType.GENERAL, ogb, "");
    }

    // ─── CROSS_CHAIN with RoutingLaw ─────────────────────────────────────────

    function test_crossChain_valid_route_passes() public {
        bytes32 leaf = keccak256("proposal-cc-valid");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 10);

        // L2 → L1 is valid
        bytes memory extra = abi.encode(uint256(L2), uint256(L1));

        vm.prank(governor);
        ge.executeWithBundle(10, GovernanceExecutor.ProposalType.CROSS_CHAIN, ogb, extra);
    }

    function test_crossChain_L3_to_L1_reverts() public {
        bytes32 leaf = keccak256("proposal-cc-invalid");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 11);

        bytes memory extra = abi.encode(uint256(L3), uint256(L1)); // forbidden route

        vm.prank(governor);
        vm.expectRevert(abi.encodeWithSelector(
            RoutingLaw.RoutingLawViolation_L3ToL1Bypass.selector,
            L3, L1
        ));
        ge.executeWithBundle(11, GovernanceExecutor.ProposalType.CROSS_CHAIN, ogb, extra);
    }

    // ─── BRAND_METADATA with BrandingInvariant ────────────────────────────────

    function test_brandMetadata_canonical_passes() public {
        bytes32 leaf = keccak256("proposal-brand");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 20);

        bytes memory extra = abi.encode("Ghost", "GST", uint8(18));

        vm.prank(governor);
        ge.executeWithBundle(20, GovernanceExecutor.ProposalType.BRAND_METADATA, ogb, extra);
    }

    function test_brandMetadata_wrong_symbol_reverts() public {
        bytes32 leaf = keccak256("proposal-brand-bad");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 21);

        bytes memory extra = abi.encode("Ghost", "ETH", uint8(18)); // bad symbol

        vm.prank(governor);
        vm.expectRevert();
        ge.executeWithBundle(21, GovernanceExecutor.ProposalType.BRAND_METADATA, ogb, extra);
    }

    // ─── TREASURY_ACTION with TreasuryInvariant ───────────────────────────────

    function test_treasuryBuyback_within_limit_passes() public {
        bytes32 leaf = keccak256("proposal-treasury");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 30);

        uint256 amount = 4_000_000 * 1e18; // 4% of 100M supply
        uint256 reserveAfter = 11_000_000 * 1e18; // > 10% of supply
        bytes memory extra = abi.encode(amount, SUPPLY, reserveAfter, true);

        vm.prank(governor);
        ge.executeWithBundle(30, GovernanceExecutor.ProposalType.TREASURY_ACTION, ogb, extra);
    }

    function test_treasuryBuyback_exceeds_limit_reverts() public {
        bytes32 leaf = keccak256("proposal-treasury-bad");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 31);

        uint256 overLimit = 6_000_000 * 1e18; // 6% of supply — exceeds 5% cap
        uint256 reserveAfter = 15_000_000 * 1e18;
        bytes memory extra = abi.encode(overLimit, SUPPLY, reserveAfter, true);

        vm.prank(governor);
        vm.expectRevert();
        ge.executeWithBundle(31, GovernanceExecutor.ProposalType.TREASURY_ACTION, ogb, extra);
    }

    // ─── isBundleConsumed ─────────────────────────────────────────────────────

    function test_isBundleConsumed_false_before_execution() public view {
        assertFalse(ge.isBundleConsumed(keccak256("new-bundle")));
    }

    function test_isBundleConsumed_true_after_execution() public {
        bytes32 leaf = keccak256("proposal-consumed");
        (bytes32 root, bytes32[] memory proof) = _trivialTree(leaf);
        GovernanceExecutor.OGBParams memory ogb = _makeOGB(leaf, proof, root, 99);

        vm.prank(governor);
        ge.executeWithBundle(99, GovernanceExecutor.ProposalType.GENERAL, ogb, "");

        assertTrue(ge.isBundleConsumed(ogb.bundleDigest));
    }
}

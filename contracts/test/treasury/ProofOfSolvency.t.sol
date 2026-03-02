// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "../foundry/TestBase.sol";
import "../../src/treasury/ProofOfSolvency.sol";

contract ProofOfSolvencyTest is TestBase {
    ProofOfSolvency private pos;
    address private constant GOV       = address(0xA11CE);
    address private constant PUBLISHER = address(0xB0B);

    /// Pre-built 3-leaf Merkle tree:
    ///   leaf0 = keccak256(abi.encode(addr(0), 5_000e18))
    ///   leaf1 = keccak256(abi.encode(addr(1), 3_000e18))
    ///   leaf2 = keccak256(abi.encode(addr(2), 2_000e18))
    ///   parent01 = keccak256(abi.encode(sorted(leaf0, leaf1)))
    ///   root = keccak256(abi.encode(sorted(parent01, leaf2)))
    bytes32 private constant ASSET_ROOT = bytes32(0);  // populated in setUp

    function setUp() public {
        pos = new ProofOfSolvency(GOV, address(0));
        vm.prank(GOV);
        pos.setPublisher(PUBLISHER, true);
    }

    // ─── publish ──────────────────────────────────────────────────────────────

    function test_publish_basic() public {
        vm.prank(PUBLISHER);
        uint256 id = pos.publish(
            10_000 ether,  // nav
            3_000 ether,   // liabilities
            bytes32("root"),
            bytes32(0)     // no IPFS
        );
        assertEq(id, 1, "first snapshot id != 1");
        ProofOfSolvency.Snapshot memory s = pos.getSnapshot(1);
        assertEq(s.surplus, 7_000 ether, "surplus wrong");
        assertEq(s.publisher, PUBLISHER, "publisher wrong");
    }

    function test_publish_insolvent_reverts() public {
        vm.prank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(ProofOfSolvency.Insolvent.selector, 1_000 ether, 2_000 ether)
        );
        pos.publish(1_000 ether, 2_000 ether, bytes32("root"), bytes32(0));
    }

    function test_publish_notPublisher_reverts() public {
        vm.expectRevert(ProofOfSolvency.NotPublisher.selector);
        pos.publish(10_000 ether, 1_000 ether, bytes32("root"), bytes32(0));
    }

    // ─── isSolvent ────────────────────────────────────────────────────────────

    function test_isSolvent_before_any_snapshot() public {
        assertTrue(!pos.isSolvent(), "should be false with no snapshots");
    }

    function test_isSolvent_after_publish() public {
        vm.prank(PUBLISHER);
        pos.publish(10_000 ether, 2_000 ether, bytes32("r"), bytes32(0));
        assertTrue(pos.isSolvent(), "should be solvent");
    }

    // ─── latestSnapshot ───────────────────────────────────────────────────────

    function test_latestSnapshot_returns_most_recent() public {
        vm.prank(PUBLISHER);
        pos.publish(10_000 ether, 1_000 ether, bytes32("r1"), bytes32(0));
        vm.prank(PUBLISHER);
        pos.publish(12_000 ether, 1_200 ether, bytes32("r2"), bytes32(0));

        ProofOfSolvency.Snapshot memory latest = pos.latestSnapshot();
        assertEq(latest.nav, 12_000 ether, "wrong latest nav");
        assertEq(latest.assetRoot, bytes32("r2"), "wrong latest root");
    }

    // ─── verifyAsset (single-leaf tree) ──────────────────────────────────────

    function test_verifyAsset_single_leaf() public {
        address  leafToken  = address(0xAABB);
        uint256  leafBal    = 5_000 ether;
        bytes32  leafHash   = keccak256(abi.encode(leafToken, leafBal));

        vm.prank(PUBLISHER);
        pos.publish(5_000 ether, 0, leafHash, bytes32(0));

        bytes32[] memory emptyProof = new bytes32[](0);
        bool valid = pos.verifyAsset(1, leafToken, leafBal, emptyProof);
        assertTrue(valid, "single-leaf verify failed");
    }

    function test_verifyAsset_wrong_balance_fails() public {
        bytes32 root = keccak256(abi.encode(address(0xAA), uint256(5_000 ether)));
        vm.prank(PUBLISHER);
        pos.publish(5_000 ether, 0, root, bytes32(0));

        bytes32[] memory emptyProof = new bytes32[](0);
        bool valid = pos.verifyAsset(1, address(0xAA), 4_999 ether, emptyProof);
        assertTrue(!valid, "should fail with wrong balance");
    }

    // ─── Fuzz ────────────────────────────────────────────────────────────────

    function testFuzz_publish_surplusCorrect(uint128 nav, uint128 liabilities) public {
        vm.assume(nav >= liabilities);
        vm.prank(PUBLISHER);
        uint256 id = pos.publish(nav, liabilities, bytes32("r"), bytes32(0));
        ProofOfSolvency.Snapshot memory s = pos.getSnapshot(id);
        assertEq(s.surplus, uint256(nav) - uint256(liabilities), "surplus mismatch");
    }
}

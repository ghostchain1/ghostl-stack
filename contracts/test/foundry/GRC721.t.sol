// GhostChain Contracts v5.6.1 (test/foundry/GRC721.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { GRC721 } from "../../src/ghost/GRC721.sol";

/// @dev Concrete GRC721 with open mint/burn for testing.
contract TestGRC721 is GRC721 {
    string private _baseURI;

    constructor() GRC721("Ghost NFT", "GNFT") {}

    function setBaseURI(string memory uri) external { _baseURI = uri; }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "GRC721: URI query for nonexistent token");
        return _baseURI;
    }
}

contract GRC721Test is Test {
    TestGRC721 internal nft;
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    function setUp() public {
        nft = new TestGRC721();
        nft.mint(alice, 1);
        nft.mint(alice, 2);
    }

    // ── ownerOf / balanceOf ───────────────────────────────────────────────────

    function test_ownerOf() public view {
        assertEq(nft.ownerOf(1), alice);
    }

    function test_balanceOf() public view {
        assertEq(nft.balanceOf(alice), 2);
    }

    function test_ownerOf_nonexistent_reverts() public {
        vm.expectRevert("GRC721: token does not exist");
        nft.ownerOf(999);
    }

    // ── tokenURI ──────────────────────────────────────────────────────────────

    function test_tokenURI() public {
        nft.setBaseURI("ghost://nft/1");
        assertEq(nft.tokenURI(1), "ghost://nft/1");
    }

    function test_tokenURI_nonexistent_reverts() public {
        vm.expectRevert("GRC721: URI query for nonexistent token");
        nft.tokenURI(99);
    }

    // ── approve / transferFrom ────────────────────────────────────────────────

    function test_approve_and_transferFrom() public {
        vm.prank(alice);
        nft.approve(bob, 1);
        assertEq(nft.getApproved(1), bob);

        vm.prank(bob);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_setApprovalForAll() public {
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);
        assertTrue(nft.isApprovedForAll(alice, bob));

        vm.prank(bob);
        nft.transferFrom(alice, bob, 2);
        assertEq(nft.ownerOf(2), bob);
    }

    // ── safeTransferFrom ──────────────────────────────────────────────────────

    function test_safeTransferFrom() public {
        vm.prank(alice);
        nft.safeTransferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }

    // ── mint / burn ───────────────────────────────────────────────────────────

    function test_mint() public {
        nft.mint(bob, 10);
        assertEq(nft.ownerOf(10), bob);
        assertEq(nft.balanceOf(bob), 1);
    }

    function test_burn() public {
        vm.prank(alice);
        nft.burn(1);
        assertEq(nft.balanceOf(alice), 1);
        vm.expectRevert("GRC721: token does not exist");
        nft.ownerOf(1);
    }

    // ── Ghost-branded aliases ─────────────────────────────────────────────────

    function test_ghostTransferFrom() public {
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);

        vm.prank(bob);
        nft.ghostTransferFrom(alice, bob, 2);
        assertEq(nft.ownerOf(2), bob);
    }

    function test_ghostSafeTransferFrom() public {
        vm.prank(alice);
        nft.ghostSafeTransferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }
}

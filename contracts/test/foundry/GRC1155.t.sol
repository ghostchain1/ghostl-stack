// GhostChain Contracts v5.6.1 (test/foundry/GRC1155.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { GRC1155 } from "../../src/ghost/GRC1155.sol";

/// @dev Concrete GRC1155 with open mint/burn for testing.
contract TestGRC1155 is GRC1155 {
    constructor() {}
}

contract GRC1155Test is Test {
    TestGRC1155 internal token;
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    uint256 constant SWORD  = 1;
    uint256 constant SHIELD = 2;

    function setUp() public {
        token = new TestGRC1155();
        token.mint(alice, SWORD, 10, "");
        token.mint(alice, SHIELD, 5, "");
    }

    // ── balanceOf / balanceOfBatch ────────────────────────────────────────────

    function test_balanceOf() public view {
        assertEq(token.balanceOf(alice, SWORD), 10);
        assertEq(token.balanceOf(alice, SHIELD), 5);
    }

    function test_balanceOfBatch() public view {
        address[] memory accounts = new address[](2);
        accounts[0] = alice;
        accounts[1] = alice;
        uint256[] memory ids = new uint256[](2);
        ids[0] = SWORD;
        ids[1] = SHIELD;

        uint256[] memory balances = token.balanceOfBatch(accounts, ids);
        assertEq(balances[0], 10);
        assertEq(balances[1], 5);
    }

    // ── safeTransferFrom ──────────────────────────────────────────────────────

    function test_safeTransferFrom() public {
        vm.prank(alice);
        token.safeTransferFrom(alice, bob, SWORD, 3, "");
        assertEq(token.balanceOf(bob, SWORD), 3);
        assertEq(token.balanceOf(alice, SWORD), 7);
    }

    function test_safeTransferFrom_revertsIfNotAuthorized() public {
        vm.prank(bob);
        vm.expectRevert("GRC1155: not authorized");
        token.safeTransferFrom(alice, bob, SWORD, 1, "");
    }

    // ── setApprovalForAll ─────────────────────────────────────────────────────

    function test_approvalForAll() public {
        vm.prank(alice);
        token.setApprovalForAll(bob, true);
        assertTrue(token.isApprovedForAll(alice, bob));

        vm.prank(bob);
        token.safeTransferFrom(alice, bob, SHIELD, 2, "");
        assertEq(token.balanceOf(bob, SHIELD), 2);
    }

    // ── safeBatchTransferFrom ─────────────────────────────────────────────────

    function test_safeBatchTransferFrom() public {
        vm.prank(alice);
        uint256[] memory ids = new uint256[](2);
        ids[0] = SWORD;
        ids[1] = SHIELD;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 4;
        amounts[1] = 2;
        token.safeBatchTransferFrom(alice, bob, ids, amounts, "");
        assertEq(token.balanceOf(bob, SWORD), 4);
        assertEq(token.balanceOf(bob, SHIELD), 2);
    }

    // ── mint / mintBatch ──────────────────────────────────────────────────────

    function test_mint() public {
        token.mint(bob, SWORD, 100, "");
        assertEq(token.balanceOf(bob, SWORD), 100);
    }

    function test_mintBatch() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = 10;
        ids[1] = 11;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 50;
        amounts[1] = 25;
        token.mintBatch(bob, ids, amounts, "");
        assertEq(token.balanceOf(bob, 10), 50);
        assertEq(token.balanceOf(bob, 11), 25);
    }

    // ── burn / burnBatch ───────────────────────────────────────────────────────

    function test_burn() public {
        vm.prank(alice);
        token.burn(alice, SWORD, 3);
        assertEq(token.balanceOf(alice, SWORD), 7);
    }

    function test_burnBatch() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = SWORD;
        ids[1] = SHIELD;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5;
        amounts[1] = 5;

        vm.prank(alice);
        token.burnBatch(alice, ids, amounts);
        assertEq(token.balanceOf(alice, SWORD), 5);
        assertEq(token.balanceOf(alice, SHIELD), 0);
    }

    function test_burn_revertsIfNotAuthorized() public {
        vm.prank(bob);
        vm.expectRevert("GRC1155: not authorized");
        token.burn(alice, SWORD, 1);
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_mint_and_burn(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000);
        token.mint(bob, 99, amount, "");
        assertEq(token.balanceOf(bob, 99), amount);

        vm.prank(bob);
        token.burn(bob, 99, amount);
        assertEq(token.balanceOf(bob, 99), 0);
    }
}

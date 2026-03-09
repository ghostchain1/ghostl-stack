// GhostChain Contracts v5.6.1 (test/foundry/GRC20.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { GRC20 } from "../../src/ghost/GRC20.sol";

/// @dev Concrete GRC20 that exposes mint/burn for testing.
contract TestGRC20 is GRC20 {
    constructor() GRC20("Ghost Test Token", "GTT", 18) {}
}

contract GRC20Test is Test {
    TestGRC20 internal token;
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    function setUp() public {
        token = new TestGRC20();
        token.mint(alice, 1_000e18);
    }

    // ── totalSupply / balanceOf ───────────────────────────────────────────────

    function test_totalSupply() public view {
        assertEq(token.totalSupply(), 1_000e18);
    }

    function test_balanceOf() public view {
        assertEq(token.balanceOf(alice), 1_000e18);
    }

    // ── transfer / allowance / transferFrom ──────────────────────────────────

    function test_transfer() public {
        vm.prank(alice);
        assertTrue(token.transfer(bob, 100e18));
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(token.balanceOf(alice), 900e18);
    }

    function test_approve_and_transferFrom() public {
        vm.prank(alice);
        token.approve(bob, 200e18);
        assertEq(token.allowance(alice, bob), 200e18);

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, bob, 150e18));
        assertEq(token.balanceOf(bob), 150e18);
        assertEq(token.allowance(alice, bob), 50e18);
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert("GRC20: insufficient balance");
        token.transfer(bob, 2_000e18);
    }

    // ── mint / burn ──────────────────────────────────────────────────────────

    function test_mint() public {
        token.mint(bob, 500e18);
        assertEq(token.balanceOf(bob), 500e18);
        assertEq(token.totalSupply(), 1_500e18);
    }

    function test_burn() public {
        vm.prank(alice);
        token.burn(100e18);
        assertEq(token.balanceOf(alice), 900e18);
        assertEq(token.totalSupply(), 900e18);
    }

    // ── Ghost-branded aliases ────────────────────────────────────────────────

    function test_ghostBalance() public view {
        assertEq(token.ghostBalance(alice), 1_000e18);
    }

    function test_ghostTransfer() public {
        vm.prank(alice);
        assertTrue(token.ghostTransfer(bob, 250e18));
        assertEq(token.balanceOf(bob), 250e18);
    }

    function test_ghostApprove() public {
        vm.prank(alice);
        assertTrue(token.ghostApprove(bob, 100e18));
        assertEq(token.ghostAllowance(alice, bob), 100e18);
    }

    function test_ghostTransferFrom() public {
        vm.prank(alice);
        token.ghostApprove(bob, 300e18);

        vm.prank(bob);
        assertTrue(token.ghostTransferFrom(alice, bob, 300e18));
        assertEq(token.balanceOf(bob), 300e18);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_transfer(uint256 amount) public {
        amount = bound(amount, 0, 1_000e18);
        vm.prank(alice);
        token.transfer(bob, amount);
        assertEq(token.balanceOf(bob), amount);
    }
}

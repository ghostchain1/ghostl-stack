// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}                from "forge-std/Test.sol";
import {GRC20}               from "../../src/ghost/GRC20.sol";
import {GSTIssuanceVault}    from "../../src/l3/economy/GSTIssuanceVault.sol";

// ── Mock GST ──────────────────────────────────────────────────────────────────

contract MockGST is GRC20 {
    constructor() GRC20("Ghost Stable Token", "GST", 18) {}
    function mintTo(address to, uint256 amt) external { _mint(to, amt); }
}

// ═════════════════════════════════════════════════════════════════════════════
// ══  PaymentGatewayTest  ══════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════

/// @title  PaymentGatewayTest
/// @notice Foundry tests for GSTIssuanceVault deployed on GhostL3 (chain 903).
///         Tests cover: chain guard, fund reserve, issue GST, idempotency,
///         access control, zero-amount/address guards, and insufficient reserve.
contract PaymentGatewayTest is Test {
    uint256 constant L3_CHAIN = 903;

    // Actors
    address admin     = makeAddr("admin");
    address alice     = makeAddr("alice");   // payment recipient
    address treasury  = makeAddr("treasury");

    MockGST           gst;
    GSTIssuanceVault  vault;

    // Sample payment tx_id (off-chain UUID → keccak256)
    bytes32 constant TX_ID  = keccak256("pay-uuid-001");
    bytes32 constant TX_ID2 = keccak256("pay-uuid-002");

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.chainId(L3_CHAIN);

        gst   = new MockGST();
        vault = new GSTIssuanceVault(address(gst), admin);

        // Mint GST to admin so they can fund the reserve
        gst.mintTo(admin, 1_000_000e18);
    }

    // ── Helper: fund vault reserve ────────────────────────────────────────────

    function _fundReserve(uint256 amount) internal {
        vm.startPrank(admin);
        gst.approve(address(vault), amount);
        vault.fundReserve(amount);
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Chain guard ───────────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Deploying on the wrong chain (e.g. L1) must revert.
    function test_vault_wrongChain_reverts() public {
        vm.chainId(14000101); // L1
        vm.expectRevert();
        new GSTIssuanceVault(address(gst), admin);
    }

    /// @dev Deploying on L2 must also revert.
    function test_vault_wrongChainL2_reverts() public {
        vm.chainId(901); // L2
        vm.expectRevert();
        new GSTIssuanceVault(address(gst), admin);
    }

    /// @dev Correct chain (L3) deploys without error.
    function test_vault_correctChain_deploys() public view {
        assertEq(block.chainid, L3_CHAIN);
        assertTrue(address(vault) != address(0));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Constructor guards ─────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_zeroGstAddress_reverts() public {
        vm.expectRevert();
        new GSTIssuanceVault(address(0), admin);
    }

    function test_vault_zeroAdminAddress_reverts() public {
        vm.expectRevert();
        new GSTIssuanceVault(address(gst), address(0));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Fund reserve ──────────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_fundReserve() public {
        _fundReserve(100_000e18);
        assertEq(vault.reserve(), 100_000e18);
    }

    function test_vault_fundReserve_emitsEvent() public {
        vm.startPrank(admin);
        gst.approve(address(vault), 50_000e18);
        vm.expectEmit(true, false, false, true);
        emit GSTIssuanceVault.ReserveFunded(admin, 50_000e18);
        vault.fundReserve(50_000e18);
        vm.stopPrank();
    }

    function test_vault_fundReserve_zeroAmount_reverts() public {
        vm.prank(admin);
        vm.expectRevert();
        vault.fundReserve(0);
    }

    function test_vault_fundReserve_onlyOwner_reverts() public {
        gst.mintTo(alice, 1_000e18);
        vm.startPrank(alice);
        gst.approve(address(vault), 1_000e18);
        vm.expectRevert();
        vault.fundReserve(1_000e18);
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Issue GST ─────────────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_issueGST() public {
        _fundReserve(100_000e18);

        uint256 amount = 1_000e18; // 1 000 GST at $0.10 = $100 payment

        vm.prank(admin);
        vault.issueGST(TX_ID, alice, amount);

        assertEq(gst.balanceOf(alice),   amount);
        assertEq(vault.reserve(),        100_000e18 - amount);
        assertEq(vault.issued(TX_ID),    amount);
        assertEq(vault.totalIssued(),    amount);
        assertTrue(vault.isFulfilled(TX_ID));
    }

    function test_vault_issueGST_emitsEvent() public {
        _fundReserve(10_000e18);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit GSTIssuanceVault.GSTIssued(TX_ID, alice, 500e18);
        vault.issueGST(TX_ID, alice, 500e18);
    }

    function test_vault_issueGST_onlyOwner_reverts() public {
        _fundReserve(10_000e18);

        vm.prank(alice);
        vm.expectRevert();
        vault.issueGST(TX_ID, alice, 100e18);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Idempotency guard ──────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_idempotent_reverts() public {
        _fundReserve(100_000e18);

        vm.startPrank(admin);
        vault.issueGST(TX_ID, alice, 1_000e18);
        vm.expectRevert(
            abi.encodeWithSelector(GSTIssuanceVault.Payment__AlreadyIssued.selector, TX_ID)
        );
        vault.issueGST(TX_ID, alice, 1_000e18);
        vm.stopPrank();
    }

    function test_vault_differentTxIds_succeed() public {
        _fundReserve(100_000e18);

        vm.startPrank(admin);
        vault.issueGST(TX_ID,  alice, 1_000e18);
        vault.issueGST(TX_ID2, alice, 2_000e18);
        vm.stopPrank();

        assertEq(gst.balanceOf(alice), 3_000e18);
        assertEq(vault.totalIssued(),  3_000e18);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Zero-value guards ──────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_zeroRecipient_reverts() public {
        _fundReserve(10_000e18);
        vm.prank(admin);
        vm.expectRevert(GSTIssuanceVault.Payment__ZeroAddress.selector);
        vault.issueGST(TX_ID, address(0), 100e18);
    }

    function test_vault_zeroAmount_reverts() public {
        _fundReserve(10_000e18);
        vm.prank(admin);
        vm.expectRevert(GSTIssuanceVault.Payment__ZeroAmount.selector);
        vault.issueGST(TX_ID, alice, 0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Insufficient reserve ───────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_insufficientReserve_reverts() public {
        _fundReserve(100e18); // only 100 GST funded

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                GSTIssuanceVault.Payment__InsufficientReserve.selector,
                500e18,
                100e18
            )
        );
        vault.issueGST(TX_ID, alice, 500e18);
    }

    function test_vault_emptyReserve_reverts() public {
        // Reserve not funded at all
        vm.prank(admin);
        vm.expectRevert();
        vault.issueGST(TX_ID, alice, 1e18);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Withdraw reserve ──────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_withdrawReserve() public {
        _fundReserve(50_000e18);

        vm.prank(admin);
        vault.withdrawReserve(treasury, 20_000e18);

        assertEq(gst.balanceOf(treasury), 20_000e18);
        assertEq(vault.reserve(),         30_000e18);
    }

    function test_vault_withdrawReserve_emitsEvent() public {
        _fundReserve(10_000e18);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit GSTIssuanceVault.ReserveWithdrawn(treasury, 5_000e18);
        vault.withdrawReserve(treasury, 5_000e18);
    }

    function test_vault_withdrawReserve_excessAmount_reverts() public {
        _fundReserve(1_000e18);

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                GSTIssuanceVault.Payment__InsufficientReserve.selector,
                2_000e18,
                1_000e18
            )
        );
        vault.withdrawReserve(treasury, 2_000e18);
    }

    function test_vault_withdrawReserve_zeroTreasury_reverts() public {
        _fundReserve(1_000e18);
        vm.prank(admin);
        vm.expectRevert(GSTIssuanceVault.Payment__ZeroAddress.selector);
        vault.withdrawReserve(address(0), 100e18);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── View: isFulfilled ─────────────────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    function test_vault_isFulfilled_false_before_issue() public view {
        assertFalse(vault.isFulfilled(TX_ID));
    }

    function test_vault_isFulfilled_true_after_issue() public {
        _fundReserve(10_000e18);
        vm.prank(admin);
        vault.issueGST(TX_ID, alice, 100e18);
        assertTrue(vault.isFulfilled(TX_ID));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ── Fuzz: issue arbitrary amounts ─────────────────────────────────────────
    // ═════════════════════════════════════════════════════════════════════════

    /// @dev Fuzzes over the amount to ensure no overflow / unexpected reverts
    ///      for amounts within the funded reserve.
    function testFuzz_vault_issueGST(uint128 rawAmount) public {
        uint256 amount = uint256(rawAmount) + 1; // ensure > 0

        // Mint exactly `amount` to admin so no balance shortfall regardless of
        // how large the fuzz input is.
        gst.mintTo(admin, amount);

        vm.startPrank(admin);
        gst.approve(address(vault), amount);
        vault.fundReserve(amount);
        vm.stopPrank();

        vm.prank(admin);
        vault.issueGST(TX_ID, alice, amount);

        assertEq(gst.balanceOf(alice),  amount);
        assertEq(vault.totalIssued(),   amount);
        assertTrue(vault.isFulfilled(TX_ID));
    }

    /// @dev Multiple non-overlapping tx ids can each be issued independently.
    function testFuzz_vault_multipleIssues(uint64 a1, uint64 a2) public {
        uint256 amt1 = uint256(a1) + 1;
        uint256 amt2 = uint256(a2) + 1;
        uint256 total = amt1 + amt2;

        _fundReserve(total);

        bytes32 id1 = keccak256(abi.encodePacked("fuzz-tx-1", a1));
        bytes32 id2 = keccak256(abi.encodePacked("fuzz-tx-2", a2));

        vm.startPrank(admin);
        vault.issueGST(id1, alice,    amt1);
        vault.issueGST(id2, treasury, amt2);
        vm.stopPrank();

        assertEq(gst.balanceOf(alice),    amt1);
        assertEq(gst.balanceOf(treasury), amt2);
        assertEq(vault.totalIssued(),     total);
    }
}

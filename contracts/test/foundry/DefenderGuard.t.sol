// GhostChain Contracts v5.6.1 (test/foundry/DefenderGuard.t.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}          from "forge-std/Test.sol";
import {DefenderGuard} from "../../src/l3/security/DefenderGuard.sol";

/**
 * @title  DefenderGuardTest
 * @notice Foundry tests for GhostBrain Defender AI on-chain guard.
 *
 *         All tests deploy with `vm.chainId(903)` to satisfy the L3-only check.
 *         Chain-mismatch tests deploy on a forked chain ID to prove the revert.
 */
contract DefenderGuardTest is Test {

    DefenderGuard internal guard;
    address       internal admin   = makeAddr("admin");
    address       internal attacker = makeAddr("attacker");

    bytes32 constant ACCOUNT_A = keccak256("user-alice");
    bytes32 constant ACCOUNT_B = keccak256("user-bob");
    address constant WALLET_X  = address(0xdEaD1);
    address constant WALLET_Y  = address(0xdEaD2);

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.chainId(903);
        guard = new DefenderGuard(admin);
    }

    // ── Constructor validation ────────────────────────────────────────────────

    function test_defender_wrongChainL1_reverts() public {
        vm.chainId(14000101);
        vm.expectRevert(abi.encodeWithSelector(DefenderGuard.Defender__WrongChain.selector, 14000101, 903));
        new DefenderGuard(admin);
    }

    function test_defender_wrongChainL2_reverts() public {
        vm.chainId(901);
        vm.expectRevert(abi.encodeWithSelector(DefenderGuard.Defender__WrongChain.selector, 901, 903));
        new DefenderGuard(admin);
    }

    function test_defender_zeroAdmin_reverts() public {
        vm.chainId(903);
        // GhostOwnable revertsion on zero address
        vm.expectRevert();
        new DefenderGuard(address(0));
    }

    function test_defender_owner_isAdmin() public view {
        assertEq(guard.owner(), admin);
    }

    // ── Freeze account ────────────────────────────────────────────────────────

    function test_defender_freezeAccount_basic() public {
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, 86400, "gift_fraud");
        assertTrue(guard.isAccountFrozen(ACCOUNT_A));
    }

    function test_defender_freeze_emits_event() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit DefenderGuard.AccountFrozen(ACCOUNT_A, 0, "bot_viewers"); // indexed topic
        guard.freezeAccount(ACCOUNT_A, 3600, "bot_viewers");
    }

    function test_defender_isAccountFrozen_true() public {
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, 7200, "test");
        assertTrue(guard.isAccountFrozen(ACCOUNT_A));
    }

    function test_defender_isAccountFrozen_false_after_expiry() public {
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, 100, "test");
        vm.warp(block.timestamp + 200);
        assertFalse(guard.isAccountFrozen(ACCOUNT_A));
    }

    function test_defender_zeroDuration_reverts() public {
        vm.prank(admin);
        vm.expectRevert(DefenderGuard.Defender__ZeroDuration.selector);
        guard.freezeAccount(ACCOUNT_A, 0, "zero-duration");
    }

    function test_defender_getFreezeRecord() public {
        uint256 duration = 3600;
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, duration, "account_farm");

        (bool active, uint48 until, string memory reason) = guard.getFreezeRecord(ACCOUNT_A);
        assertTrue(active);
        assertEq(until, block.timestamp + duration);
        assertEq(reason, "account_farm");
    }

    function test_defender_getFreezeRecord_expired() public {
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, 50, "test");
        vm.warp(block.timestamp + 100);

        (bool active,,) = guard.getFreezeRecord(ACCOUNT_A);
        assertFalse(active);
    }

    // ── Unfreeze account ──────────────────────────────────────────────────────

    function test_defender_unfreezeAccount() public {
        vm.startPrank(admin);
        guard.freezeAccount(ACCOUNT_A, 86400, "test");
        guard.unfreezeAccount(ACCOUNT_A);
        vm.stopPrank();

        assertFalse(guard.isAccountFrozen(ACCOUNT_A));
    }

    function test_defender_unfreeze_emits_event() public {
        vm.startPrank(admin);
        guard.freezeAccount(ACCOUNT_A, 86400, "test");
        vm.expectEmit(true, false, false, false);
        emit DefenderGuard.AccountUnfrozen(ACCOUNT_A);
        guard.unfreezeAccount(ACCOUNT_A);
        vm.stopPrank();
    }

    function test_defender_unfreeze_notFrozen_reverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(DefenderGuard.Defender__NotFrozen.selector, ACCOUNT_B));
        guard.unfreezeAccount(ACCOUNT_B);
    }

    function test_defender_freeze_multiple_accounts_independently() public {
        vm.startPrank(admin);
        guard.freezeAccount(ACCOUNT_A, 1000, "reason-a");
        guard.freezeAccount(ACCOUNT_B, 2000, "reason-b");
        vm.stopPrank();

        assertTrue(guard.isAccountFrozen(ACCOUNT_A));
        assertTrue(guard.isAccountFrozen(ACCOUNT_B));

        vm.warp(block.timestamp + 1500); // A expired, B still active
        assertFalse(guard.isAccountFrozen(ACCOUNT_A));
        assertTrue(guard.isAccountFrozen(ACCOUNT_B));
    }

    // ── Block wallet ──────────────────────────────────────────────────────────

    function test_defender_blockWallet_basic() public {
        vm.prank(admin);
        guard.blockWallet(WALLET_X, "payment_fraud");
        assertTrue(guard.isWalletBlocked(WALLET_X));
    }

    function test_defender_blockWallet_emits_event() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit DefenderGuard.WalletBlocked(WALLET_X, "payment_fraud");
        guard.blockWallet(WALLET_X, "payment_fraud");
    }

    function test_defender_blockWallet_storesReason() public {
        vm.prank(admin);
        guard.blockWallet(WALLET_X, "gift_ring_detected");
        assertEq(guard.getBlockReason(WALLET_X), "gift_ring_detected");
    }

    function test_defender_isWalletBlocked_false_by_default() public view {
        assertFalse(guard.isWalletBlocked(WALLET_Y));
    }

    function test_defender_alreadyBlocked_reverts() public {
        vm.startPrank(admin);
        guard.blockWallet(WALLET_X, "first block");
        vm.expectRevert(abi.encodeWithSelector(DefenderGuard.Defender__AlreadyBlocked.selector, WALLET_X));
        guard.blockWallet(WALLET_X, "second block");
        vm.stopPrank();
    }

    function test_defender_blockZeroAddress_reverts() public {
        vm.prank(admin);
        vm.expectRevert(DefenderGuard.Defender__ZeroAddress.selector);
        guard.blockWallet(address(0), "zero address");
    }

    // ── Unblock wallet ────────────────────────────────────────────────────────

    function test_defender_unblockWallet() public {
        vm.startPrank(admin);
        guard.blockWallet(WALLET_X, "test");
        guard.unblockWallet(WALLET_X);
        vm.stopPrank();
        assertFalse(guard.isWalletBlocked(WALLET_X));
    }

    function test_defender_unblock_emits_event() public {
        vm.startPrank(admin);
        guard.blockWallet(WALLET_X, "test");
        vm.expectEmit(true, false, false, false);
        emit DefenderGuard.WalletUnblocked(WALLET_X);
        guard.unblockWallet(WALLET_X);
        vm.stopPrank();
    }

    function test_defender_unblock_notBlocked_reverts() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(DefenderGuard.Defender__NotBlocked.selector, WALLET_Y));
        guard.unblockWallet(WALLET_Y);
    }

    function test_defender_unblock_clearsReason() public {
        vm.startPrank(admin);
        guard.blockWallet(WALLET_X, "some reason");
        guard.unblockWallet(WALLET_X);
        vm.stopPrank();
        assertEq(guard.getBlockReason(WALLET_X), "");
    }

    // ── Access control ────────────────────────────────────────────────────────

    function test_defender_onlyOwner_freeze_reverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        guard.freezeAccount(ACCOUNT_A, 86400, "malicious");
    }

    function test_defender_onlyOwner_unfreeze_reverts() public {
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, 86400, "test");

        vm.prank(attacker);
        vm.expectRevert();
        guard.unfreezeAccount(ACCOUNT_A);
    }

    function test_defender_onlyOwner_block_reverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        guard.blockWallet(WALLET_X, "malicious");
    }

    function test_defender_onlyOwner_unblock_reverts() public {
        vm.prank(admin);
        guard.blockWallet(WALLET_X, "test");

        vm.prank(attacker);
        vm.expectRevert();
        guard.unblockWallet(WALLET_X);
    }

    // ── Counters ──────────────────────────────────────────────────────────────

    function test_defender_totalCounters() public {
        vm.startPrank(admin);
        guard.freezeAccount(ACCOUNT_A, 1000, "r1");
        guard.freezeAccount(ACCOUNT_B, 2000, "r2");
        guard.blockWallet(WALLET_X, "r3");
        guard.blockWallet(WALLET_Y, "r4");
        vm.stopPrank();

        assertEq(guard.totalFreezes(), 2);
        assertEq(guard.totalBlocks(), 2);
    }

    function test_defender_unfreeze_does_not_decrement_counter() public {
        vm.startPrank(admin);
        guard.freezeAccount(ACCOUNT_A, 1000, "test");
        guard.unfreezeAccount(ACCOUNT_A);
        vm.stopPrank();
        // Counter should still be 1 — tracks total ever frozen, not current active
        assertEq(guard.totalFreezes(), 1);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_defender_freeze_duration(uint32 durationSeconds) public {
        vm.assume(durationSeconds > 0 && durationSeconds <= 365 days);
        vm.prank(admin);
        guard.freezeAccount(ACCOUNT_A, durationSeconds, "fuzz-test");

        assertTrue(guard.isAccountFrozen(ACCOUNT_A));

        (bool active, uint48 until,) = guard.getFreezeRecord(ACCOUNT_A);
        assertTrue(active);
        assertEq(until, block.timestamp + durationSeconds);
    }

    function testFuzz_defender_blockAndUnblock(address wallet) public {
        vm.assume(wallet != address(0));
        vm.startPrank(admin);
        guard.blockWallet(wallet, "fuzz-block");
        assertTrue(guard.isWalletBlocked(wallet));
        guard.unblockWallet(wallet);
        assertFalse(guard.isWalletBlocked(wallet));
        vm.stopPrank();
    }
}

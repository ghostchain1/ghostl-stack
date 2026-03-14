// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/exchange/GhostXFeeCollector.sol";
import "../../src/exchange/GhostXVault.sol";
import "../../src/exchange/GhostXOrderBook.sol";
import "../../src/exchange/GhostXBadge.sol";
import "../../src/exchange/GhostXStaking.sol";
import "../../src/exchange/IGhostXOrderBook.sol";

// ─── Minimal ERC-20 ───────────────────────────────────────────────────────────

contract MockToken {
    string public name;
    string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s) { name = n; symbol = s; }

    function mint(address to, uint256 amount) external {
        totalSupply   += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        return true;
    }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

contract GhostXStakingBadgeTest is Test {
    address constant TREASURY = address(0xBEEF);
    address constant ALICE    = address(0xA11CE);
    address constant BOB      = address(0xB0B);
    address constant SWEEPER  = address(0xFEE5);

    MockToken        gst;
    GhostXFeeCollector fc;
    GhostXBadge      badge;
    GhostXStaking    staking;

    uint256 constant ONE = 1e18;

    function setUp() public {
        gst     = new MockToken("Ghost Token", "GST");
        fc      = new GhostXFeeCollector(SWEEPER);
        badge   = new GhostXBadge();
        staking = new GhostXStaking(
            address(gst),
            address(gst),   // reward token = stake token for simplicity
            address(badge),
            address(fc)
        );

        // Wire badge → staking
        badge.setStakingContract(address(staking));
        // Wire feeCollector → staking
        fc.setStakingContract(address(staking));

        // Fund Alice & Bob
        gst.mint(ALICE, 100_000 * ONE);
        gst.mint(BOB,   100_000 * ONE);
        gst.mint(address(this), 50_000 * ONE);

        // Pre-approve staking contract
        vm.prank(ALICE); gst.approve(address(staking), type(uint256).max);
        vm.prank(BOB);   gst.approve(address(staking), type(uint256).max);
    }

    // ── Badge: mint on first stake ────────────────────────────────────────────

    function test_badge_minted_on_bronze_stake() public {
        vm.prank(ALICE);
        staking.stake(100 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        assertTrue(badge.hasBadge(ALICE), "badge not minted");
        GhostXBadge.Badge memory b = badge.getBadge(ALICE);
        assertEq(uint8(b.tier), uint8(GhostXBadge.Tier.BRONZE), "wrong tier");
    }

    function test_no_badge_below_threshold() public {
        vm.prank(ALICE);
        staking.stake(50 * ONE, GhostXStaking.LockPeriod.FLEXIBLE); // < 100 threshold

        assertFalse(badge.hasBadge(ALICE), "should have no badge below threshold");
    }

    function test_badge_upgrades_to_silver() public {
        vm.prank(ALICE);
        staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        GhostXBadge.Badge memory b = badge.getBadge(ALICE);
        assertEq(uint8(b.tier), uint8(GhostXBadge.Tier.SILVER), "expected SILVER");
    }

    function test_badge_upgrades_to_gold() public {
        vm.prank(ALICE);
        staking.stake(10_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        GhostXBadge.Badge memory b = badge.getBadge(ALICE);
        assertEq(uint8(b.tier), uint8(GhostXBadge.Tier.GOLD), "expected GOLD");
    }

    function test_badge_upgrades_to_diamond() public {
        vm.prank(ALICE);
        staking.stake(50_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        GhostXBadge.Badge memory b = badge.getBadge(ALICE);
        assertEq(uint8(b.tier), uint8(GhostXBadge.Tier.DIAMOND), "expected DIAMOND");
    }

    // ── Badge: discount BPS ───────────────────────────────────────────────────

    function test_discount_bronze() public {
        vm.prank(ALICE);
        staking.stake(100 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        assertEq(badge.discountBps(ALICE), 1_000, "bronze discount should be 10%");
    }

    function test_discount_diamond() public {
        vm.prank(ALICE);
        staking.stake(50_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        assertEq(badge.discountBps(ALICE), 5_000, "diamond discount should be 50%");
    }

    function test_discount_no_badge() public view {
        assertEq(badge.discountBps(address(0xDEAD)), 0, "should be 0 with no badge");
    }

    // ── Badge: soulbound ──────────────────────────────────────────────────────

    function test_badge_is_soulbound() public {
        vm.prank(ALICE);
        staking.stake(100 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        uint256 tokenId = badge.getBadge(ALICE).tokenId;

        vm.expectRevert(GhostXBadge.Soulbound.selector);
        badge.transferFrom(ALICE, BOB, tokenId);
    }

    function test_badge_one_per_address() public {
        vm.prank(ALICE);
        staking.stake(100 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        // Staking more shouldn't mint a second badge, just upgrade
        vm.prank(ALICE);
        staking.stake(900 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        assertEq(badge.balanceOf(ALICE), 1, "should only have 1 badge");
    }

    // ── Staking: rewards accumulator ─────────────────────────────────────────

    function test_rewards_distribute_proportionally() public {
        vm.prank(ALICE); staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        vm.prank(BOB);   staking.stake(3_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        // Total: 4000 GST — Alice 25%, Bob 75%

        // Owner deposits rewards
        uint256 rewardAmt = 400 * ONE;
        gst.approve(address(staking), rewardAmt);
        staking.depositRewards(rewardAmt);

        uint256 alicePending = staking.pendingRewards(ALICE);
        uint256 bobPending   = staking.pendingRewards(BOB);

        // Allow 1 wei rounding
        assertApproxEqAbs(alicePending, 100 * ONE, 1, "alice should get ~25%");
        assertApproxEqAbs(bobPending,   300 * ONE, 1, "bob   should get ~75%");
    }

    function test_harvest_transfers_rewards() public {
        vm.prank(ALICE); staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        uint256 rewardAmt = 100 * ONE;
        gst.approve(address(staking), rewardAmt);
        staking.depositRewards(rewardAmt);

        uint256 before = gst.balanceOf(ALICE);
        vm.prank(ALICE); staking.harvest();
        uint256 received = gst.balanceOf(ALICE) - before;

        assertApproxEqAbs(received, 100 * ONE, 1, "should receive full rewards");
    }

    // ── Staking: lock periods & multipliers ────────────────────────────────────

    function test_locked_stake_higher_weighted() public {
        vm.prank(ALICE); staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);
        vm.prank(BOB);   staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.LOCKED_180);

        GhostXStaking.Stake memory aliceS = staking.getStake(ALICE);
        GhostXStaking.Stake memory bobS   = staking.getStake(BOB);

        assertGt(bobS.weightedAmount, aliceS.weightedAmount, "locked180 should have higher weight");
        // Bob weighted = 1000 * 2.5 = 2500; Alice = 1000 * 1 = 1000
        assertEq(aliceS.weightedAmount, 1_000 * ONE,   "alice weight wrong");
        assertEq(bobS.weightedAmount,   2_500 * ONE,   "bob weight wrong");
    }

    function test_revert_unstake_while_locked() public {
        vm.prank(ALICE);
        staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.LOCKED_30);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(GhostXStaking.StillLocked.selector, staking.getStake(ALICE).unlocksAt));
        staking.unstake();
    }

    function test_unstake_after_lock_expires() public {
        vm.prank(ALICE);
        staking.stake(1_000 * ONE, GhostXStaking.LockPeriod.LOCKED_30);

        // Fast-forward 31 days
        vm.warp(block.timestamp + 31 days);

        uint256 before = gst.balanceOf(ALICE);
        vm.prank(ALICE); staking.unstake();
        assertEq(gst.balanceOf(ALICE) - before, 1_000 * ONE, "should receive staked tokens back");
    }

    function test_partial_unstake_flexible() public {
        vm.prank(ALICE);
        staking.stake(2_000 * ONE, GhostXStaking.LockPeriod.FLEXIBLE);

        uint256 before = gst.balanceOf(ALICE);
        vm.prank(ALICE); staking.unstakePartial(500 * ONE);
        assertEq(gst.balanceOf(ALICE) - before, 500 * ONE, "partial unstake amount wrong");
        assertEq(staking.getStake(ALICE).amount, 1_500 * ONE, "remaining stake wrong");
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    /// @dev Fuzz: depositing rewards and harvesting should never credit more than deposited.
    function testFuzz_rewards_never_exceed_deposited(uint128 stakeAmt, uint128 rewardAmt) public {
        vm.assume(stakeAmt >= 100 * ONE && stakeAmt <= 50_000 * ONE);
        vm.assume(rewardAmt >= 1 && rewardAmt <= 10_000 * ONE);

        gst.mint(ALICE, stakeAmt);
        gst.mint(address(this), rewardAmt);

        vm.prank(ALICE); gst.approve(address(staking), type(uint256).max);
        vm.prank(ALICE); staking.stake(stakeAmt, GhostXStaking.LockPeriod.FLEXIBLE);

        gst.approve(address(staking), rewardAmt);
        staking.depositRewards(rewardAmt);

        uint256 pending = staking.pendingRewards(ALICE);
        assertLe(pending, rewardAmt + 1, "rewards exceed deposited (rounding)");
    }
}

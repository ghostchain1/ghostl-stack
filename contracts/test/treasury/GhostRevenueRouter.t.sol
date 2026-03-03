// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {GhostRevenueRouter} from "../../src/treasury/GhostRevenueRouter.sol";
import {TreasuryVault} from "../../src/treasury/TreasuryVault.sol";
import {TestERC20} from "../../src/tokens/TestERC20.sol";

contract GhostRevenueRouterTest is Test {
    GhostRevenueRouter internal router;
    TreasuryVault internal vault;
    TestERC20 internal token;

    address internal governance = address(0xA11CE);
    address internal timelock   = address(0xB0B);
    address internal source     = address(0x5051CE);
    address internal treasury   = address(0xFEE5);

    // Bucket recipient addresses
    address internal ops        = address(0x01);
    address internal validators = address(0x02);
    address internal buyback    = address(0x03);
    address internal payroll    = address(0x04);
    address internal grants     = address(0x05);
    address internal reserves   = address(0x06);

    GhostRevenueRouter.BucketConfig[6] internal defaultConfig;

    function setUp() public {
        vault  = new TreasuryVault(address(this));
        router = new GhostRevenueRouter(governance, timelock, vault);
        token  = new TestERC20("Ghost Stable", "GST", 18);

        // Build config: all weights sum to 10_000 bps
        defaultConfig[0] = GhostRevenueRouter.BucketConfig({bps: 2000, recipient: ops,        label: "ops"});
        defaultConfig[1] = GhostRevenueRouter.BucketConfig({bps: 2500, recipient: validators, label: "validators"});
        defaultConfig[2] = GhostRevenueRouter.BucketConfig({bps: 1000, recipient: buyback,    label: "buyback"});
        defaultConfig[3] = GhostRevenueRouter.BucketConfig({bps: 2000, recipient: payroll,    label: "payroll"});
        defaultConfig[4] = GhostRevenueRouter.BucketConfig({bps: 1000, recipient: grants,     label: "grants"});
        defaultConfig[5] = GhostRevenueRouter.BucketConfig({bps: 1500, recipient: reserves,   label: "reserves"});

        // Configure buckets and approve source
        vm.startPrank(governance);
        router.configureBuckets(defaultConfig);
        router.setApprovedSource(source, true);
        vm.stopPrank();
    }

    // ── configureBuckets ─────────────────────────────────────────────────────

    function test_configureBuckets_validWeights() public view {
        // All 6 buckets should be readable after setUp
        for (uint8 i = 0; i < 6; i++) {
            GhostRevenueRouter.BucketConfig memory bc = router.getBucket(GhostRevenueRouter.Bucket(i));
            uint16 bps = bc.bps;
            assertTrue(bps > 0, "bucket weight should be > 0");
        }
    }

    function test_configureBuckets_invalidWeights_reverts() public {
        GhostRevenueRouter.BucketConfig[6] memory bad = defaultConfig;
        bad[0].bps = 9999; // total ≠ 10_000

        vm.prank(governance);
        vm.expectRevert(GhostRevenueRouter.InvalidBucketWeights.selector);
        router.configureBuckets(bad);
    }

    function test_configureBuckets_notGovernance_reverts() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        router.configureBuckets(defaultConfig);
    }

    // ── approveSource / routeERC20 ────────────────────────────────────────────

    function test_routeERC20_from_approvedSource() public {
        uint256 amount = 1000e18;
        token.mint(source, amount);

        vm.startPrank(source);
        token.approve(address(router), amount);
        router.routeERC20(address(token), amount);
        vm.stopPrank();

        // OPS = 20% → 200e18
        assertEq(token.balanceOf(ops),        200e18,  "ops");
        // VALIDATORS = 25% → 250e18
        assertEq(token.balanceOf(validators), 250e18,  "validators");
        // BUYBACK = 10% → 100e18
        assertEq(token.balanceOf(buyback),    100e18,  "buyback");
        // PAYROLL = 20% → 200e18
        assertEq(token.balanceOf(payroll),    200e18,  "payroll");
        // GRANTS = 10% → 100e18
        assertEq(token.balanceOf(grants),     100e18,  "grants");
        // RESERVES = 15% → 150e18
        assertEq(token.balanceOf(reserves),   150e18,  "reserves");

        // Router should hold zero (no dust for round amounts)
        assertEq(token.balanceOf(address(router)), 0, "router dust");
    }

    function test_routeERC20_notApprovedSource_reverts() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(GhostRevenueRouter.NotApprovedSource.selector);
        router.routeERC20(address(token), 1e18);
    }

    function test_routeERC20_zeroAmount_reverts() public {
        vm.prank(source);
        vm.expectRevert(bytes("amount=0"));
        router.routeERC20(address(token), 0);
    }

    // ── routeNative ────────────────────────────────────────────────────────────

    function test_routeNative_distributes_correctly() public {
        vm.deal(source, 10 ether);

        uint256 opsBefore        = ops.balance;
        uint256 validatorsBefore = validators.balance;

        vm.prank(source);
        router.routeNative{value: 10 ether}();

        assertEq(ops.balance        - opsBefore,        2 ether,  "ops native");
        assertEq(validators.balance - validatorsBefore, 2.5 ether, "validators native");
    }

    function test_routeNative_notApprovedSource_reverts() public {
        vm.deal(address(0xBAD), 1 ether);
        vm.prank(address(0xBAD));
        vm.expectRevert(GhostRevenueRouter.NotApprovedSource.selector);
        router.routeNative{value: 1 ether}();
    }

    function test_routeNative_zeroValue_reverts() public {
        vm.prank(source);
        vm.expectRevert(bytes("value=0"));
        router.routeNative{value: 0}();
    }

    // ── updateBucket ──────────────────────────────────────────────────────────

    function test_updateBucket_changesRecipient() public {
        address newRecipient = address(0x1234);
        // Reduce ops by 500bps and give to new recipient replacing grants (keep total = 10_000)
        // Simpler: just update the recipient without changing bps
        vm.prank(governance);
        router.updateBucket(GhostRevenueRouter.Bucket.OPS, 2000, newRecipient, "ops-v2");

        uint256 amount = 100e18;
        token.mint(source, amount);

        vm.startPrank(source);
        token.approve(address(router), amount);
        router.routeERC20(address(token), amount);
        vm.stopPrank();

        // OPS now goes to newRecipient
        assertEq(token.balanceOf(newRecipient), 20e18, "new ops recipient");
        assertEq(token.balanceOf(ops), 0, "old ops recipient should be zero");
    }

    function test_updateBucket_notGovernance_reverts() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        router.updateBucket(GhostRevenueRouter.Bucket.OPS, 2000, ops, "ops");
    }

    // ── Source revocation ──────────────────────────────────────────────────────

    function test_revokedSource_reverts() public {
        vm.prank(governance);
        router.setApprovedSource(source, false);

        token.mint(source, 1e18);
        vm.startPrank(source);
        token.approve(address(router), 1e18);
        vm.expectRevert(GhostRevenueRouter.NotApprovedSource.selector);
        router.routeERC20(address(token), 1e18);
        vm.stopPrank();
    }

    // ── totalRouted accounting ─────────────────────────────────────────────────

    function test_totalRouted_accumulates() public {
        uint256 amt1 = 500e18;
        uint256 amt2 = 300e18;

        token.mint(source, amt1 + amt2);

        vm.startPrank(source);
        token.approve(address(router), amt1 + amt2);
        router.routeERC20(address(token), amt1);
        router.routeERC20(address(token), amt2);
        vm.stopPrank();

        assertEq(router.totalReceived(address(token)), amt1 + amt2, "cumulative total");
    }

    // ── Fuzz: weights must sum to exactly 10_000 ───────────────────────────────

    function testFuzz_configureBuckets_rejectsImbalanced(uint16 w0) public {
        vm.assume(w0 < 10_000 && w0 != 2000);

        GhostRevenueRouter.BucketConfig[6] memory bad = defaultConfig;
        bad[0].bps = w0;
        // total ≠ 10_000 unless w0 == 2000

        vm.prank(governance);
        vm.expectRevert(GhostRevenueRouter.InvalidBucketWeights.selector);
        router.configureBuckets(bad);
    }

    function testFuzz_routeERC20_noFundsLost(uint128 amount) public {
        vm.assume(amount >= 6); // need at least 1 wei per bucket

        token.mint(source, amount);

        vm.startPrank(source);
        token.approve(address(router), amount);
        router.routeERC20(address(token), amount);
        vm.stopPrank();

        uint256 distributed = token.balanceOf(ops)
            + token.balanceOf(validators)
            + token.balanceOf(buyback)
            + token.balanceOf(payroll)
            + token.balanceOf(grants)
            + token.balanceOf(reserves)
            + token.balanceOf(address(router)); // dust may land here

        assertEq(distributed, amount, "conservation: no funds lost");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}                    from "forge-std/Test.sol";
import {GRC20}                   from "../../src/ghost/GRC20.sol";
import {MarketingCampaignVault}  from "../../src/l3/economy/MarketingCampaignVault.sol";

// ── Mock GST ──────────────────────────────────────────────────────────────────

contract MockGST is GRC20 {
    constructor() GRC20("Ghost Stable Token", "GST", 18) {}
    function mintTo(address to, uint256 amt) external { _mint(to, amt); }
}

// ═════════════════════════════════════════════════════════════════════════════
// ══  MarketingAITest  ════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════

contract MarketingAITest is Test {
    uint256 constant L3 = 903;

    // actors
    address admin    = makeAddr("admin");
    address alice    = makeAddr("alice");
    address treasury = makeAddr("treasury");

    MockGST                gst;
    MarketingCampaignVault vault;

    // campaign ids (keccak of uuid strings)
    bytes32 constant CAMP_A = keccak256("campaign-a");
    bytes32 constant CAMP_B = keccak256("campaign-b");
    bytes32 constant CAMP_C = keccak256("campaign-c");

    uint256 constant BUDGET = 500e18;   // 500 GST

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.chainId(L3);

        gst   = new MockGST();
        vault = new MarketingCampaignVault(address(gst));

        // Transfer ownership to admin (vault is owned by test contract at deploy)
        // Re-deploy with admin as the caller
        vm.prank(admin);
        vault = new MarketingCampaignVault(address(gst));

        // Fund admin with GST
        gst.mintTo(admin, 10_000e18);

        // Admin approves vault to pull GST
        vm.prank(admin);
        gst.approve(address(vault), type(uint256).max);
    }

    // ── Wrong chain ───────────────────────────────────────────────────────────

    function test_vault_wrongChain_reverts() public {
        vm.chainId(1); // Ethereum mainnet — not allowed
        vm.expectRevert();
        new MarketingCampaignVault(address(gst));
    }

    // ── Create vault ──────────────────────────────────────────────────────────

    function test_vault_createCampaignVault() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        assertEq(vault.budgets(CAMP_A), BUDGET);
        assertEq(vault.spent(CAMP_A),   0);
        assertTrue(vault.vaultExists(CAMP_A));
        assertEq(vault.remainingBudget(CAMP_A), BUDGET);

        // GST transferred in
        assertEq(gst.balanceOf(address(vault)), BUDGET);
    }

    function test_vault_createCampaignVault_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MarketingCampaignVault.VaultCreated(CAMP_A, BUDGET);

        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);
    }

    function test_vault_duplicateVault_reverts() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectRevert(
            abi.encodeWithSelector(
                MarketingCampaignVault.Marketing__VaultExists.selector, CAMP_A
            )
        );
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);
    }

    function test_vault_zeroAmount_reverts() public {
        vm.expectRevert(MarketingCampaignVault.Marketing__ZeroAmount.selector);
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, 0);
    }

    function test_vault_onlyOwner_create_reverts() public {
        vm.expectRevert();
        vm.prank(alice); // not owner
        vault.createCampaignVault(CAMP_A, BUDGET);
    }

    function test_vault_zeroGstAddress_reverts() public {
        vm.chainId(L3);
        vm.expectRevert(MarketingCampaignVault.Marketing__ZeroAddress.selector);
        new MarketingCampaignVault(address(0));
    }

    // ── Spend budget ──────────────────────────────────────────────────────────

    function test_vault_spendBudget() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.prank(admin);
        vault.spendBudget(CAMP_A, alice, 100e18);

        assertEq(vault.spent(CAMP_A),           100e18);
        assertEq(vault.remainingBudget(CAMP_A), BUDGET - 100e18);
        assertEq(gst.balanceOf(alice),          100e18);
    }

    function test_vault_spendBudget_emitsEvent() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectEmit(true, true, false, true);
        emit MarketingCampaignVault.BudgetSpent(CAMP_A, alice, 100e18);

        vm.prank(admin);
        vault.spendBudget(CAMP_A, alice, 100e18);
    }

    function test_vault_spendBudget_multipleSpends() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.prank(admin); vault.spendBudget(CAMP_A, alice,    200e18);
        vm.prank(admin); vault.spendBudget(CAMP_A, treasury, 150e18);
        vm.prank(admin); vault.spendBudget(CAMP_A, alice,     50e18);

        assertEq(vault.spent(CAMP_A),           400e18);
        assertEq(vault.remainingBudget(CAMP_A), 100e18);
        assertEq(gst.balanceOf(alice),          250e18);
        assertEq(gst.balanceOf(treasury),       150e18);
    }

    function test_vault_overBudget_reverts() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectRevert(
            abi.encodeWithSelector(
                MarketingCampaignVault.Marketing__OverBudget.selector,
                CAMP_A, BUDGET + 1, BUDGET
            )
        );
        vm.prank(admin);
        vault.spendBudget(CAMP_A, alice, BUDGET + 1);
    }

    function test_vault_spendBudget_vaultNotFound_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketingCampaignVault.Marketing__VaultNotFound.selector, CAMP_B
            )
        );
        vm.prank(admin);
        vault.spendBudget(CAMP_B, alice, 100e18);
    }

    function test_vault_spendBudget_zeroAddress_reverts() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectRevert(MarketingCampaignVault.Marketing__ZeroAddress.selector);
        vm.prank(admin);
        vault.spendBudget(CAMP_A, address(0), 100e18);
    }

    function test_vault_onlyOwner_spend_reverts() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectRevert();
        vm.prank(alice);
        vault.spendBudget(CAMP_A, alice, 100e18);
    }

    // ── Refund ────────────────────────────────────────────────────────────────

    function test_vault_refundCampaign() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        // Spend 200 GST
        vm.prank(admin);
        vault.spendBudget(CAMP_A, alice, 200e18);

        uint256 treasuryBefore = gst.balanceOf(treasury);

        vm.prank(admin);
        vault.refundCampaign(CAMP_A, treasury);

        // 300 GST refunded (500 - 200)
        assertEq(gst.balanceOf(treasury) - treasuryBefore, 300e18);
        assertEq(vault.remainingBudget(CAMP_A), 0);
    }

    function test_vault_refundCampaign_emitsEvent() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectEmit(true, true, false, true);
        emit MarketingCampaignVault.CampaignRefunded(CAMP_A, treasury, BUDGET);

        vm.prank(admin);
        vault.refundCampaign(CAMP_A, treasury);
    }

    function test_vault_refundCampaign_zero_remaining() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        // Spend full budget first
        vm.prank(admin);
        vault.spendBudget(CAMP_A, alice, BUDGET);

        uint256 bal = gst.balanceOf(treasury);
        vm.prank(admin);
        vault.refundCampaign(CAMP_A, treasury);

        // No change — nothing to refund
        assertEq(gst.balanceOf(treasury), bal);
    }

    function test_vault_refundCampaign_notFound_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketingCampaignVault.Marketing__VaultNotFound.selector, CAMP_C
            )
        );
        vm.prank(admin);
        vault.refundCampaign(CAMP_C, treasury);
    }

    function test_vault_refundCampaign_zeroTreasury_reverts() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);

        vm.expectRevert(MarketingCampaignVault.Marketing__ZeroAddress.selector);
        vm.prank(admin);
        vault.refundCampaign(CAMP_A, address(0));
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function test_vault_vaultExists_false_before_create() public view {
        assertFalse(vault.vaultExists(CAMP_B));
        assertEq(vault.remainingBudget(CAMP_B), 0);
    }

    function test_vault_campaignExists_after_create() public {
        vm.prank(admin);
        vault.createCampaignVault(CAMP_A, BUDGET);
        assertTrue(vault.vaultExists(CAMP_A));
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_vault_budget_spend(
        uint128 budgetRaw,
        uint64  spendRaw
    ) public {
        uint256 budget = uint256(budgetRaw) + 1;  // no zero budget
        uint256 spend  = uint256(spendRaw);

        gst.mintTo(admin, budget);
        vm.prank(admin);
        gst.approve(address(vault), budget);

        vm.prank(admin);
        vault.createCampaignVault(CAMP_B, budget);

        if (spend == 0 || spend > budget) {
            if (spend == 0) {
                vm.expectRevert(MarketingCampaignVault.Marketing__ZeroAmount.selector);
            } else {
                vm.expectRevert();
            }
            vm.prank(admin);
            vault.spendBudget(CAMP_B, alice, spend);
        } else {
            vm.prank(admin);
            vault.spendBudget(CAMP_B, alice, spend);
            assertEq(vault.spent(CAMP_B), spend);
            assertEq(vault.remainingBudget(CAMP_B), budget - spend);
            assertEq(gst.balanceOf(alice), spend);
        }
    }
}

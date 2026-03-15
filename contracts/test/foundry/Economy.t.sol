// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test}                  from "forge-std/Test.sol";
import {GRC20}                 from "../../src/ghost/GRC20.sol";
import {CreatorSalaryDistributor} from "../../src/l3/economy/CreatorSalaryDistributor.sol";
import {LeagueRegistry}        from "../../src/l3/economy/LeagueRegistry.sol";
import {CompetitionVault}      from "../../src/l3/economy/CompetitionVault.sol";

// ── Mock GST ──────────────────────────────────────────────────────────────────

contract MockGST is GRC20 {
    constructor() GRC20("Ghost Stable Token", "GST", 18) {}
    function mintTo(address to, uint256 amt) external { _mint(to, amt); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ══  EconomyTest  ════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

contract EconomyTest is Test {
    uint256 constant L3 = 903;

    // actors
    address admin  = makeAddr("admin");
    address alice  = makeAddr("alice");
    address bob    = makeAddr("bob");
    address carol  = makeAddr("carol");
    address dave   = makeAddr("dave");

    MockGST                  gst;
    CreatorSalaryDistributor salary;
    LeagueRegistry           league;
    CompetitionVault         vault;

    // ── Helpers ───────────────────────────────────────────────────────────────

    bytes32 constant CYCLE_ID  = keccak256("2026-03");
    bytes32 constant SEASON_ID = keccak256("season-1");
    bytes32 constant COMP_ID   = keccak256("comp-1");

    function setUp() public {
        vm.chainId(L3);

        gst    = new MockGST();
        salary = new CreatorSalaryDistributor(address(gst), admin);
        league = new LeagueRegistry(admin);
        vault  = new CompetitionVault(address(gst), admin);

        // Fund salary contract and admin
        gst.mintTo(address(salary), 500_000e18);
        gst.mintTo(admin,           500_000e18);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── CreatorSalaryDistributor ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function test_salary_wrongChain_reverts() public {
        vm.chainId(1);
        vm.expectRevert();
        vm.prank(admin);
        salary.openCycle(CYCLE_ID, "2026-03", 100_000e18);
    }

    function test_salary_openCycle() public {
        vm.prank(admin);
        salary.openCycle(CYCLE_ID, "2026-03", 100_000e18);

        (string memory label,,, bool open) = _salaryFields(CYCLE_ID);
        assertEq(label, "2026-03");
        assertTrue(open);
    }

    function test_salary_distribute_bronze() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0); // TIER_BRONZE
        assertEq(salary.payouts(CYCLE_ID, alice), 1_000e18);
        assertTrue(salary.paid(CYCLE_ID, alice));
    }

    function test_salary_distribute_silver() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 1); // TIER_SILVER
        assertEq(salary.payouts(CYCLE_ID, alice), 5_000e18);
    }

    function test_salary_distribute_gold() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 2); // TIER_GOLD
        assertEq(salary.payouts(CYCLE_ID, alice), 15_000e18);
    }

    function test_salary_distribute_elite() public {
        _openCycle(200_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 3); // TIER_ELITE
        assertEq(salary.payouts(CYCLE_ID, alice), 50_000e18);
    }

    function test_salary_gst_transferred_to_creator() public {
        _openCycle(100_000e18);
        uint256 before = gst.balanceOf(alice);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0);
        assertEq(gst.balanceOf(alice), before + 1_000e18);
    }

    function test_salary_distributeBatch() public {
        _openCycle(500_000e18);
        address[] memory creators = new address[](3);
        uint8[]   memory tiers    = new uint8[](3);
        creators[0] = alice; tiers[0] = 0; // bronze
        creators[1] = bob;   tiers[1] = 1; // silver
        creators[2] = carol; tiers[2] = 2; // gold

        vm.prank(admin);
        salary.distributeBatch(CYCLE_ID, creators, tiers);

        assertEq(salary.payouts(CYCLE_ID, alice), 1_000e18);
        assertEq(salary.payouts(CYCLE_ID, bob),   5_000e18);
        assertEq(salary.payouts(CYCLE_ID, carol), 15_000e18);
    }

    function test_salary_alreadyPaid_reverts() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0);
        vm.expectRevert();
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0);
    }

    function test_salary_invalidTier_reverts() public {
        _openCycle(100_000e18);
        vm.expectRevert();
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 99);
    }

    function test_salary_closeCycle() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0);
        vm.prank(admin);
        salary.closeCycle(CYCLE_ID);
        (,,, bool open) = _salaryFields(CYCLE_ID);
        assertFalse(open);
    }

    function test_salary_distributeAfterClose_reverts() public {
        _openCycle(100_000e18);
        vm.prank(admin);
        salary.closeCycle(CYCLE_ID);
        vm.expectRevert();
        vm.prank(admin);
        salary.distribute(CYCLE_ID, alice, 0);
    }

    function test_salary_insufficientReserve_reverts() public {
        // Contract has 500_000e18 but we ask for 600_000e18 in reserve
        vm.expectRevert();
        vm.prank(admin);
        salary.openCycle(CYCLE_ID, "2026-03", 600_000e18);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── LeagueRegistry ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function test_league_openSeason() public {
        _openSeason();
        (string memory name,,, bool open) = _seasonFields(SEASON_ID);
        assertEq(name, "Season 1");
        assertTrue(open);
    }

    function test_league_wrongChain_reverts() public {
        vm.chainId(1);
        vm.expectRevert();
        vm.prank(admin);
        league.openSeason(SEASON_ID, "Season 1", block.timestamp, block.timestamp + 30 days);
    }

    function test_league_closeSeason() public {
        _openSeason();
        vm.prank(admin);
        league.closeSeason(SEASON_ID);
        (,,, bool open) = _seasonFields(SEASON_ID);
        assertFalse(open);
    }

    function test_league_setStanding() public {
        _openSeason();
        vm.prank(admin);
        league.setStanding(SEASON_ID, alice, 2, 1, 2000e18); // gold, rank 1
        LeagueRegistry.Standing memory s = league.getStanding(SEASON_ID, alice);
        assertEq(s.tier, 2);
        assertEq(s.rankInTier, 1);
        assertEq(s.score, 2000e18);
    }

    function test_league_setStanding_invalidTier_reverts() public {
        _openSeason();
        vm.expectRevert();
        vm.prank(admin);
        league.setStanding(SEASON_ID, alice, 99, 1, 100e18);
    }

    function test_league_setStanding_zeroAddress_reverts() public {
        _openSeason();
        vm.expectRevert();
        vm.prank(admin);
        league.setStanding(SEASON_ID, address(0), 0, 1, 100e18);
    }

    function test_league_onlyOwner_reverts() public {
        _openSeason();
        vm.expectRevert();
        vm.prank(alice); // not owner
        league.setStanding(SEASON_ID, bob, 0, 1, 100e18);
    }

    function test_league_applyPromotionRelegation() public {
        _openSeason();
        vm.prank(admin);
        league.setStanding(SEASON_ID, alice, 1, 5, 500e18); // silver
        vm.prank(admin);
        league.applyPromotionRelegation(SEASON_ID, alice, true, false, 2); // promoted to gold
        LeagueRegistry.Standing memory s = league.getStanding(SEASON_ID, alice);
        assertTrue(s.promoted);
        assertEq(s.tier, 2);
    }

    function test_league_activeSeasonId() public {
        _openSeason();
        assertEq(league.activeSeasonId(), SEASON_ID);
    }

    function test_league_totalSeasons() public {
        _openSeason();
        assertEq(league.totalSeasons(), 1);
    }

    function test_league_setStanding_closedSeason_reverts() public {
        _openSeason();
        vm.prank(admin);
        league.closeSeason(SEASON_ID);
        vm.expectRevert();
        vm.prank(admin);
        league.setStanding(SEASON_ID, alice, 0, 1, 100e18);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── CompetitionVault ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function test_vault_createVault() public {
        _createVault(10_000e18);
        assertTrue(vault.vaultExists(COMP_ID));
        assertEq(vault.vaultBalance(COMP_ID), 10_000e18);
    }

    function test_vault_wrongChain_reverts() public {
        vm.chainId(1);
        vm.prank(admin);
        vm.expectRevert();
        vault.createVault(COMP_ID, 1000e18);
    }

    function test_vault_duplicateVault_reverts() public {
        _createVault(10_000e18);
        vm.startPrank(admin);
        gst.approve(address(vault), 10_000e18);
        vm.expectRevert();
        vault.createVault(COMP_ID, 10_000e18);
        vm.stopPrank();
    }

    function test_vault_awardPrize() public {
        _createVault(10_000e18);
        uint256 before = gst.balanceOf(alice);
        vm.prank(admin);
        vault.awardPrize(COMP_ID, alice, 5_000e18); // 50% first place
        assertEq(gst.balanceOf(alice), before + 5_000e18);
        assertEq(vault.prizeAwarded(COMP_ID, alice), 5_000e18);
        assertEq(vault.vaultBalance(COMP_ID), 5_000e18);
    }

    function test_vault_alreadyAwarded_reverts() public {
        _createVault(10_000e18);
        vm.prank(admin);
        vault.awardPrize(COMP_ID, alice, 5_000e18);
        vm.expectRevert();
        vm.prank(admin);
        vault.awardPrize(COMP_ID, alice, 1_000e18);
    }

    function test_vault_insufficientBalance_reverts() public {
        _createVault(1_000e18);
        vm.expectRevert();
        vm.prank(admin);
        vault.awardPrize(COMP_ID, alice, 2_000e18);
    }

    function test_vault_batchAwardPrizes() public {
        _createVault(10_000e18);
        address[] memory winners = new address[](3);
        uint256[] memory amounts = new uint256[](3);
        winners[0] = alice; amounts[0] = 5_000e18;
        winners[1] = bob;   amounts[1] = 2_500e18;
        winners[2] = carol; amounts[2] = 1_250e18;

        vm.prank(admin);
        vault.batchAwardPrizes(COMP_ID, winners, amounts);

        assertEq(gst.balanceOf(alice), 5_000e18);
        assertEq(gst.balanceOf(bob),   2_500e18);
        assertEq(gst.balanceOf(carol), 1_250e18);
        assertEq(vault.vaultBalance(COMP_ID), 1_250e18); // remainder
    }

    function test_vault_refund() public {
        _createVault(10_000e18);
        // Award one prize first
        vm.prank(admin);
        vault.awardPrize(COMP_ID, alice, 5_000e18);
        // Refund the remaining 5,000 GST to admin (treasury)
        uint256 before = gst.balanceOf(admin);
        vm.prank(admin);
        vault.refund(COMP_ID, admin);
        assertEq(gst.balanceOf(admin), before + 5_000e18);
        assertEq(vault.vaultBalance(COMP_ID), 0);
    }

    function test_vault_onlyOwner_reverts() public {
        _createVault(10_000e18);
        vm.expectRevert();
        vm.prank(alice); // not owner
        vault.awardPrize(COMP_ID, alice, 1_000e18);
    }

    function test_vault_vaultInfo() public {
        _createVault(10_000e18);
        (uint256 balance, uint256 awarded, bool cancelled) = vault.vaultInfo(COMP_ID);
        assertEq(balance, 10_000e18);
        assertEq(awarded, 0);
        assertFalse(cancelled);
    }

    function testFuzz_vault_prize_distribution(uint128 pool, uint8 nWinners) public {
        // bound to sane ranges
        uint256 poolGst = bound(uint256(pool), 3e18, 100_000e18);
        uint256 cnt     = bound(uint256(nWinners), 1, 5);

        gst.mintTo(admin, poolGst);
        vm.prank(admin);
        gst.approve(address(vault), poolGst);

        bytes32 cid = keccak256(abi.encodePacked(pool, nWinners));
        vm.prank(admin);
        vault.createVault(cid, poolGst);

        // Award first-place (50%)
        uint256 firstPrize = poolGst / 2;
        address winner = makeAddr("fuzz_winner");
        vm.prank(admin);
        vault.awardPrize(cid, winner, firstPrize);

        assertEq(vault.prizeAwarded(cid, winner), firstPrize);
        assertLe(vault.vaultBalance(cid), poolGst);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── Helpers ────────────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    function _openCycle(uint256 reserve) internal {
        vm.prank(admin);
        salary.openCycle(CYCLE_ID, "2026-03", reserve);
    }

    function _openSeason() internal {
        uint256 start = block.timestamp + 1;
        uint256 end_  = block.timestamp + 30 days;
        vm.prank(admin);
        league.openSeason(SEASON_ID, "Season 1", start, end_);
    }

    function _createVault(uint256 poolGst) internal {
        vm.prank(admin);
        gst.approve(address(vault), poolGst);
        vm.prank(admin);
        vault.createVault(COMP_ID, poolGst);
    }

    // Destructure Cycle tuple fields (public mapping returns tuple)
    function _salaryFields(bytes32 id)
        internal view
        returns (string memory label, uint256 reserved, uint256 paidGst, bool open)
    {
        (string memory _label, uint256 _reserved, uint256 _paid, uint256 _count, bool _open) = salary.cycles(id);
        return (_label, _reserved, _paid, _open);
    }

    // Destructure Season tuple fields (public mapping returns tuple)
    function _seasonFields(bytes32 id)
        internal view
        returns (string memory name, uint256 startsAt, uint256 endsAt, bool open)
    {
        (string memory _name, uint256 _start, uint256 _end, bool _open) = league.seasons(id);
        return (_name, _start, _end, _open);
    }
}
